import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { defaultPreferences, fetchPreferences } from '../lib/preferencesApi'
import { markRecipeCooked, setRecipeFavorite } from '../lib/recipeApi'
import { useRecipeSpeech } from '../lib/useRecipeSpeech'
import { useI18n } from '../lib/useI18n'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  UserPreferences,
} from '../types/ui'

type RecipeDetailPageProps = {
  recipe: Recipe
  onBack: () => void
  onNavigate?: (page: AppDestination) => void
  onInventoryUpdated?: (ingredients: Ingredient[]) => void
  onLogout?: () => void | Promise<void>
}

export function RecipeDetailPage({
  recipe,
  onBack,
  onInventoryUpdated,
}: RecipeDetailPageProps) {
  const { language, t } = useI18n()
  const [servings, setServings] = useState(1)
  const [isCooking, setIsCooking] = useState(false)
  const [isFavorite, setIsFavorite] = useState(Boolean(recipe.isFavorite))
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false)
  const [message, setMessage] = useState('')
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences)
  const displayTags = isFavorite
    ? Array.from(new Set([t('recipe.favoriteTag'), ...recipe.tags]))
    : recipe.tags.filter(
        (tag) => tag !== 'お気に入り' && tag !== t('recipe.favoriteTag'),
      )
  const steps =
    recipe.steps?.length
      ? recipe.steps
      : recipe.cookProcess
        ? recipe.cookProcess
            .split(/\r?\n/)
            .map((step) => step.trim())
            .filter(Boolean)
        : []
  const recipeSpeech = useRecipeSpeech({
    recipeName: recipe.name,
    recipeMeta: recipe.meta,
    ingredients: recipe.ingredients ?? [],
    steps,
    language,
    t,
  })
  const isVoiceGuideEnabled = Boolean(preferences.voice?.enabled)
  const isRecipeSpeechPaused = recipeSpeech.isPaused
  const isRecipeSpeechSpeaking = recipeSpeech.isSpeaking
  const stopRecipeSpeech = recipeSpeech.stop

  useEffect(() => {
    let isMounted = true

    function loadPreferences() {
      fetchPreferences()
        .then((result) => {
          if (isMounted) {
            setPreferences(result.preferences)
          }
        })
        .catch((error) => {
          console.warn('[vite] Preferences fetch failed:', error)
        })
    }

    function handlePreferencesUpdated(event: Event) {
      const nextPreferences = (
        event as CustomEvent<{ preferences?: UserPreferences }>
      ).detail?.preferences

      if (nextPreferences) {
        setPreferences(nextPreferences)
        return
      }

      loadPreferences()
    }

    loadPreferences()
    window.addEventListener('preferences-updated', handlePreferencesUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('preferences-updated', handlePreferencesUpdated)
    }
  }, [])

  useEffect(() => {
    if (!isVoiceGuideEnabled && (isRecipeSpeechSpeaking || isRecipeSpeechPaused)) {
      stopRecipeSpeech()
    }
  }, [
    isVoiceGuideEnabled,
    isRecipeSpeechPaused,
    isRecipeSpeechSpeaking,
    stopRecipeSpeech,
  ])

  async function handleCooked() {
    if (!recipe.recipeId) {
      setMessage(t('recipe.savedOnlyInventory'))
      return
    }

    setIsCooking(true)
    setMessage('')

    try {
      const result = await markRecipeCooked(recipe.recipeId, servings, language)
      onInventoryUpdated?.(result.inventory)
      setMessage(t('recipe.inventoryUpdated', { servings }))
      setIsCooking(false)
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setMessage(t('recipe.inventoryUpdateFailed'))
      setIsCooking(false)
    }
  }

  async function handleFavoriteToggle() {
    if (!recipe.recipeId) {
      setMessage(t('recipe.savedOnlyFavorite'))
      return
    }

    const nextFavorite = !isFavorite
    setIsUpdatingFavorite(true)
    setMessage('')

    try {
      const result = await setRecipeFavorite(recipe.recipeId, nextFavorite)
      setIsFavorite(result.isFavorite)
      setMessage(
        result.isFavorite
          ? t('recipe.favoriteAdded')
          : t('recipe.favoriteRemoved'),
      )
      setIsUpdatingFavorite(false)
    } catch (error) {
      console.error('[vite] Favorite update failed:', error)
      setMessage(t('recipe.favoriteUpdateFailed'))
      setIsUpdatingFavorite(false)
    }
  }

  return (
    <>
      <main className="recipe-detail">
        <div className="recipe-detail__toolbar">
          <button type="button" className="secondary-button" onClick={onBack}>
            {t('common.back')}
          </button>
          <button
            type="button"
            className={`favorite-button ${isFavorite ? 'is-active' : ''}`}
            onClick={handleFavoriteToggle}
            disabled={isUpdatingFavorite}
          >
            <Icon name="heart" />
            <span>
              {isUpdatingFavorite
                ? t('common.updating')
                : isFavorite
                  ? t('recipe.favoriteSaved')
                  : t('recipe.favoriteAdd')}
            </span>
          </button>
        </div>

        <section className="recipe-detail__hero">
          <p className="eyebrow">{t('recipe.detailEyebrow')}</p>
          <h1>{recipe.name}</h1>
          <p>
            {recipe.meta}
            {recipe.reason ? ` / ${recipe.reason}` : ''}
          </p>
          <div className="tag-row">
            {displayTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>

        {message ? (
          <p className="status-message" role="status">
            {message}
          </p>
        ) : null}

        {isVoiceGuideEnabled ? (
          <section
            className="panel recipe-voice-panel"
            aria-labelledby="recipe-voice-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipe.voice.eyebrow')}</p>
                <h2 id="recipe-voice-title">{t('recipe.voice.title')}</h2>
              </div>
              <span
                className={`recipe-voice-status recipe-voice-status--${recipeSpeech.status}`}
                role="status"
              >
                {recipeSpeech.statusLabel}
              </span>
            </div>

            <div className="recipe-voice-controls">
              <button
                type="button"
                className="primary-button"
                onClick={
                  recipeSpeech.isPaused
                    ? recipeSpeech.resume
                    : recipeSpeech.startGuide
                }
                disabled={!recipeSpeech.isSpeechSupported}
              >
                <Icon name={recipeSpeech.isPaused ? 'play' : 'volume'} />
                <span>
                  {recipeSpeech.isPaused
                    ? t('recipe.voice.resume')
                    : t('recipe.voice.start')}
                </span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.pause}
                disabled={!recipeSpeech.isSpeechSupported || !recipeSpeech.isSpeaking}
              >
                <Icon name="pause" />
                <span>{t('recipe.voice.pause')}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.stop}
                disabled={!recipeSpeech.isSpeechSupported}
              >
                <Icon name="stop" />
                <span>{t('recipe.voice.stop')}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.speakIngredients}
                disabled={
                  !recipeSpeech.isSpeechSupported || !recipe.ingredients?.length
                }
              >
                <Icon name="basket" />
                <span>{t('recipe.voice.ingredients')}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.previousStep}
                disabled={!recipeSpeech.isSpeechSupported || steps.length === 0}
              >
                <Icon name="skipBack" />
                <span>{t('recipe.voice.previous')}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.nextStep}
                disabled={!recipeSpeech.isSpeechSupported || steps.length === 0}
              >
                <Icon name="skipForward" />
                <span>{t('recipe.voice.next')}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={recipeSpeech.repeatCurrent}
                disabled={!recipeSpeech.isSpeechSupported || steps.length === 0}
              >
                <Icon name="repeat" />
                <span>{t('recipe.voice.repeat')}</span>
              </button>
              <button
                type="button"
                className={`secondary-button recipe-voice-listen ${
                  recipeSpeech.isListening ? 'is-active' : ''
                }`}
                onClick={recipeSpeech.listenForCommand}
                disabled={!recipeSpeech.isRecognitionSupported}
              >
                <Icon name="mic" />
                <span>
                  {recipeSpeech.isListening
                    ? t('recipe.voice.listening')
                    : t('recipe.voice.listen')}
                </span>
              </button>
            </div>

            {recipeSpeech.transcript ? (
              <p className="recipe-voice-transcript">
                {t('recipe.voice.transcript', {
                  command: recipeSpeech.transcript,
                })}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="recipe-detail__grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipe.ingredientsEyebrow')}</p>
                <h2>{t('recipe.ingredientsTitle')}</h2>
              </div>
            </div>

            {recipe.ingredients?.length ? (
              <ul className="detail-list">
                {recipe.ingredients.map((ingredient, index) => (
                  <li
                    key={`${ingredient.ingredientId}-${ingredient.name}-${index}`}
                  >
                    <span>{ingredient.name}</span>
                    <strong>
                      {ingredient.amount}
                      {ingredient.unit}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-text">{t('recipe.ingredientsEmpty')}</p>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipe.stepsEyebrow')}</p>
                <h2>{t('recipe.stepsTitle')}</h2>
              </div>
            </div>

            {steps.length ? (
              <ol className="steps-list">
                {steps.map((step, index) => (
                  <li
                    key={step}
                    className={
                      isVoiceGuideEnabled && index === recipeSpeech.currentStepIndex
                        ? 'is-current'
                        : undefined
                    }
                  >
                    {step.replace(/^\d+\.\s*/, '')}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-text">{t('recipe.stepsEmpty')}</p>
            )}
          </section>
        </div>

        <section className="cook-complete-panel">
          <label className="serving-field">
            <span>{t('recipe.servingsQuestion')}</span>
            <input
              type="number"
              min="1"
              max="20"
              value={servings}
              onChange={(event) =>
                setServings(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={handleCooked}
            disabled={isCooking}
          >
            {isCooking ? t('common.updating') : t('recipe.markCooked')}
          </button>
        </section>
      </main>
    </>
  )
}
