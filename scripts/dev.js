import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const viteBin = resolve('node_modules', 'vite', 'bin', 'vite.js')
const apiPort = Number(process.env.PORT ?? 8787)
const vitePort = 3000

function getListeningPids(port) {
  try {
    return execFileSync('lsof', [
      '-tiTCP:' + String(port),
      '-sTCP:LISTEN',
      '-n',
      '-P',
    ], {
      encoding: 'utf8',
    })
      .split(/\s+/)
      .filter(Boolean)
  } catch {
    return []
  }
}

function getCommand(pid) {
  try {
    return execFileSync('ps', ['-p', pid, '-o', 'command='], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

function releaseStalePort(port, expectedCommandPart, label) {
  for (const pid of getListeningPids(port)) {
    const command = getCommand(pid)

    if (!command.includes(expectedCommandPart)) {
      console.error(
        `[node] Port ${port} is already used by another process: ${command || pid}`,
      )
      process.exit(1)
    }

    console.info(`[node] Stopping stale ${label} on port ${port} (pid ${pid})`)
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {
      // Process may have already exited.
    }
  }
}

releaseStalePort(apiPort, 'server/index.js', 'API server')
releaseStalePort(vitePort, 'vite', 'Vite server')

const processes = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, [viteBin], { stdio: 'inherit' }),
]

function stopAll(exitCode = 0) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(exitCode)
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopAll(code)
    }
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
