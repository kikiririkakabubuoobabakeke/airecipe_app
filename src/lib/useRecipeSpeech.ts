import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LanguageCode, MessageKey, TranslateFn } from './i18n'
import type { RecipeIngredientAmount } from '../types/ui'

type SpeechRecognitionResultEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type WindowWithSpeechRecognition = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

type VoiceCommand =
  | 'next'
  | 'previous'
  | 'repeat'
  | 'ingredients'
  | 'pause'
  | 'resume'
  | 'stop'

type VoiceStatus =
  | 'idle'
  | 'speaking'
  | 'paused'
  | 'listening'
  | 'unsupported'
  | 'recognitionUnsupported'
  | 'unknown'
  | 'noContent'

type UseRecipeSpeechOptions = {
  recipeName: string
  recipeMeta: string
  ingredients: RecipeIngredientAmount[]
  steps: string[]
  language: LanguageCode
  t: TranslateFn
}

const statusMessageKeys: Record<VoiceStatus, MessageKey> = {
  idle: 'recipe.voice.status.idle',
  speaking: 'recipe.voice.status.speaking',
  paused: 'recipe.voice.status.paused',
  listening: 'recipe.voice.status.listening',
  unsupported: 'recipe.voice.status.unsupported',
  recognitionUnsupported: 'recipe.voice.status.recognitionUnsupported',
  unknown: 'recipe.voice.status.unknown',
  noContent: 'recipe.voice.status.noContent',
}

const languageTags: Record<LanguageCode, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  fr: 'fr-FR',
}

function stripStepNumber(step: string) {
  return step.replace(/^\d+\.\s*/, '').trim()
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  const speechWindow = window as WindowWithSpeechRecognition
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  )
}

function normalizeCommandText(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[、。,.!?！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function matchVoiceCommand(text: string): VoiceCommand | null {
  const normalizedText = normalizeCommandText(text)

  if (
    includesAny(normalizedText, [
      '次',
      'つぎ',
      '進む',
      'next',
      'suivant',
      'suivante',
      'prochaine',
    ])
  ) {
    return 'next'
  }

  if (
    includesAny(normalizedText, [
      '前',
      'まえ',
      '戻',
      'back',
      'previous',
      'précédent',
      'precedent',
      'retour',
    ])
  ) {
    return 'previous'
  }

  if (
    includesAny(normalizedText, [
      'もう一回',
      'もう一度',
      '繰り返',
      'repeat',
      'again',
      'répète',
      'repete',
      'encore',
    ])
  ) {
    return 'repeat'
  }

  if (
    includesAny(normalizedText, [
      '材料',
      '食材',
      'ingredients',
      'ingredient',
      'ingrédients',
      'ingrédient',
    ])
  ) {
    return 'ingredients'
  }

  if (
    includesAny(normalizedText, [
      '一時停止',
      'ポーズ',
      'pause',
    ])
  ) {
    return 'pause'
  }

  if (
    includesAny(normalizedText, [
      '再開',
      '続き',
      'resume',
      'continue',
      'reprendre',
      'continuer',
    ])
  ) {
    return 'resume'
  }

  if (
    includesAny(normalizedText, [
      '停止',
      '止め',
      'ストップ',
      'stop',
      'arrêt',
      'arrete',
      'arrête',
    ])
  ) {
    return 'stop'
  }

  return null
}

export function useRecipeSpeech({
  recipeName,
  recipeMeta,
  ingredients,
  steps,
  language,
  t,
}: UseRecipeSpeechOptions) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const isSpeechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  const isRecognitionSupported = getSpeechRecognitionConstructor() !== null
  const speechLanguage = languageTags[language]
  const cleanedSteps = useMemo(
    () => steps.map(stripStepNumber).filter(Boolean),
    [steps],
  )

  const stop = useCallback(() => {
    if (!isSpeechSupported) {
      setStatus('unsupported')
      return
    }

    window.speechSynthesis.cancel()
    utteranceRef.current = null
    setIsSpeaking(false)
    setIsPaused(false)
    setStatus('idle')
  }, [isSpeechSupported])

  const speakText = useCallback(
    (text: string) => {
      const nextText = text.trim()

      if (!nextText) {
        setStatus('noContent')
        return
      }

      if (!isSpeechSupported) {
        setStatus('unsupported')
        return
      }

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(nextText)
      utterance.lang = speechLanguage
      utterance.rate = 0.95
      utterance.pitch = 1
      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null
          setIsSpeaking(false)
          setIsPaused(false)
          setStatus('idle')
        }
      }
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null
          setIsSpeaking(false)
          setIsPaused(false)
          setStatus('idle')
        }
      }

      utteranceRef.current = utterance
      setIsSpeaking(true)
      setIsPaused(false)
      setStatus('speaking')
      window.speechSynthesis.speak(utterance)
    },
    [isSpeechSupported, speechLanguage],
  )

  const buildIngredientsText = useCallback(() => {
    if (!ingredients.length) {
      return ''
    }

    const ingredientText = ingredients
      .map((ingredient) =>
        t('recipe.voice.ingredientLine', {
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
        }),
      )
      .join(' ')

    return `${t('recipe.voice.ingredientsIntro', { recipe: recipeName })} ${ingredientText}`
  }, [ingredients, recipeName, t])

  const buildStepText = useCallback(
    (index: number) => {
      const step = cleanedSteps[index]
      if (!step) {
        return ''
      }

      return t('recipe.voice.stepLine', {
        number: index + 1,
        total: cleanedSteps.length,
        step,
      })
    },
    [cleanedSteps, t],
  )

  const speakIngredients = useCallback(() => {
    speakText(buildIngredientsText())
  }, [buildIngredientsText, speakText])

  const speakStep = useCallback(
    (index: number) => {
      if (!cleanedSteps.length) {
        speakText(
          `${t('recipe.voice.recipeIntro', {
            recipe: recipeName,
            meta: recipeMeta,
          })} ${buildIngredientsText()}`,
        )
        return
      }

      const nextIndex = Math.min(Math.max(index, 0), cleanedSteps.length - 1)
      setCurrentStepIndex(nextIndex)
      speakText(buildStepText(nextIndex))
    },
    [
      buildIngredientsText,
      buildStepText,
      cleanedSteps.length,
      recipeMeta,
      recipeName,
      speakText,
      t,
    ],
  )

  const startGuide = useCallback(() => {
    speakStep(currentStepIndex)
  }, [currentStepIndex, speakStep])

  const previousStep = useCallback(() => {
    speakStep(currentStepIndex - 1)
  }, [currentStepIndex, speakStep])

  const nextStep = useCallback(() => {
    speakStep(currentStepIndex + 1)
  }, [currentStepIndex, speakStep])

  const repeatCurrent = useCallback(() => {
    speakStep(currentStepIndex)
  }, [currentStepIndex, speakStep])

  const pause = useCallback(() => {
    if (!isSpeechSupported || !isSpeaking) {
      return
    }

    window.speechSynthesis.pause()
    setIsPaused(true)
    setStatus('paused')
  }, [isSpeaking, isSpeechSupported])

  const resume = useCallback(() => {
    if (!isSpeechSupported) {
      setStatus('unsupported')
      return
    }

    window.speechSynthesis.resume()
    setIsPaused(false)
    setIsSpeaking(true)
    setStatus('speaking')
  }, [isSpeechSupported])

  const handleVoiceCommand = useCallback(
    (commandText: string) => {
      const command = matchVoiceCommand(commandText)

      if (!command) {
        setStatus('unknown')
        return
      }

      if (command === 'next') {
        nextStep()
        return
      }

      if (command === 'previous') {
        previousStep()
        return
      }

      if (command === 'repeat') {
        repeatCurrent()
        return
      }

      if (command === 'ingredients') {
        speakIngredients()
        return
      }

      if (command === 'pause') {
        pause()
        return
      }

      if (command === 'resume') {
        resume()
        return
      }

      stop()
    },
    [
      nextStep,
      pause,
      previousStep,
      repeatCurrent,
      resume,
      speakIngredients,
      stop,
    ],
  )

  const listenForCommand = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor()

    if (!Recognition) {
      setStatus('recognitionUnsupported')
      return
    }

    recognitionRef.current?.abort()

    const recognition = new Recognition()
    recognition.lang = speechLanguage
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const commandText = event.results[0]?.[0]?.transcript ?? ''
      setTranscript(commandText)
      handleVoiceCommand(commandText)
    }
    recognition.onerror = () => {
      setIsListening(false)
      setStatus('idle')
    }
    recognition.onend = () => {
      setIsListening(false)
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
    }

    recognitionRef.current = recognition
    setIsListening(true)
    setTranscript('')
    setStatus('listening')
    try {
      recognition.start()
    } catch {
      setIsListening(false)
      setStatus('idle')
    }
  }, [handleVoiceCommand, speechLanguage])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      if (isSpeechSupported) {
        window.speechSynthesis.cancel()
      }
    }
  }, [isSpeechSupported])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (!isMounted) {
        return
      }

      setCurrentStepIndex(0)
      setTranscript('')
      stop()
    })

    return () => {
      isMounted = false
    }
  }, [recipeName, stop])

  return {
    currentStepIndex,
    isListening,
    isPaused,
    isRecognitionSupported,
    isSpeaking,
    isSpeechSupported,
    status,
    statusLabel: t(statusMessageKeys[status]),
    transcript,
    listenForCommand,
    nextStep,
    pause,
    previousStep,
    repeatCurrent,
    resume,
    speakIngredients,
    startGuide,
    stop,
  }
}
