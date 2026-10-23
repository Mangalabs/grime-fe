import { useEffect, useState, type FormEvent } from 'react'
import { auth, ApiError, joinWaitlist } from '../api/client'
import type { AuthUser } from '../api/contracts'
import {
  ArchiveIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MoonIcon,
  PenIcon,
  SunIcon,
} from '../components/icons'
import { initialTheme, type Theme } from '../features/theme'
import '../App.css'
import './AuthPage.css'

type Mode = 'login' | 'register' | 'waitlist'

// An invite link (/?convite=K7QM-3XPD-9HTR) opens registration with the code filled.
function inviteFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('convite')?.trim() ?? ''
  } catch {
    return ''
  }
}

function clearInviteFromUrl() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('convite')) return
  url.searchParams.delete('convite')
  window.history.replaceState(null, '', url)
}

const minPasswordLength = 10

const promises = [
  {
    icon: <ArchiveIcon />,
    title: 'Cânone vivo',
    text: 'O Arquivista registra personagens, lugares e fatos de cada cena.',
  },
  {
    icon: <PenIcon />,
    title: 'Aponta, nunca reescreve',
    text: 'Cada diagnóstico traz o trecho exato e uma orientação. O texto continua seu.',
  },
  {
    icon: <LockIcon />,
    title: 'Cifrado no seu navegador',
    text: 'Cenas e notas são protegidas pela senha de cada projeto.',
  },
]

export function AuthPage({
  notice,
  onAuthenticated,
}: {
  notice?: string
  onAuthenticated: (user: AuthUser) => void
}) {
  const [inviteCode, setInviteCode] = useState(inviteFromUrl)
  const [mode, setMode] = useState<Mode>(() => (inviteCode ? 'register' : 'login'))
  const [waitlistMessage, setWaitlistMessage] = useState('')
  const [hasJoinedWaitlist, setHasJoinedWaitlist] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem('grime-theme', next)
    } catch {
      // Storage can be unavailable (private mode); the choice lasts the session.
    }
  }

  const isRegister = mode === 'register'
  const isWaitlist = mode === 'waitlist'
  const passwordTooShort = isRegister && password.length > 0 && password.length < minPasswordLength
  const mismatch = isRegister && confirmation.length > 0 && confirmation !== password
  const canSubmit = isWaitlist
    ? name.trim() !== '' && email.trim() !== ''
    : email.trim() !== '' &&
      password !== '' &&
      (!isRegister ||
        (name.trim() !== '' && password.length >= minPasswordLength && confirmation === password))

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setHasJoinedWaitlist(false)
    setPassword('')
    setConfirmation('')
    setShowPassword(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      if (isWaitlist) {
        await joinWaitlist({
          name: name.trim(),
          email: email.trim(),
          message: waitlistMessage.trim() || undefined,
        })
        setHasJoinedWaitlist(true)
        return
      }
      const user = isRegister
        ? await auth.register({
            name: name.trim(),
            email: email.trim(),
            password,
            inviteCode: inviteCode.trim() || undefined,
          })
        : await auth.login({ email: email.trim(), password })
      clearInviteFromUrl()
      onAuthenticated(user)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
          : caught instanceof ApiError && caught.status !== 500
            ? caught.message
            : 'Não foi possível conectar. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-showcase" aria-label="Sobre o Petricor">
        <div className="auth-rain" aria-hidden="true" />
        <div className="auth-showcase-inner">
          <div className="auth-wordmark">
            <span className="brand-mark" aria-hidden="true">P</span>
            <span>Petricor</span>
          </div>

          <div className="auth-pitch">
            <h2>Um revisor que lembra de cada página do seu livro.</h2>
            <p>
              O Petricor lê suas cenas contra o cânone da obra e aponta contradições, ritmo e estilo, sem
              reescrever uma linha.
            </p>
          </div>

          {/* A sample of what the Revisor does, in the product's own look. */}
          <figure className="auth-specimen" aria-label="Exemplo de diagnóstico">
            <p className="auth-specimen-scene">Cena 14 · A carta</p>
            <blockquote>
              Marta guardou a carta no bolso, embora a tivesse{' '}
              <mark>queimado na noite anterior</mark>.
            </blockquote>
            <figcaption className="auth-specimen-note">
              <span className="auth-specimen-severity">Crítico · Quebra de continuidade</span>
              Na cena 12, a carta é destruída pelo fogo.
            </figcaption>
          </figure>

          <ul className="auth-promises">
            {promises.map((promise) => (
              <li key={promise.title}>
                <span className="auth-promise-icon" aria-hidden="true">{promise.icon}</span>
                <span>
                  <strong>{promise.title}</strong>
                  {promise.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="auth-panel" aria-labelledby="auth-title">
        <button
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          className="icon-button auth-theme-toggle"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          type="button"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="auth-form-wrap">
          <p className="eyebrow">{isWaitlist ? 'Lista de espera' : isRegister ? 'Nova conta' : 'Acesso'}</p>
          <h1 id="auth-title">
            {isWaitlist ? 'Peça seu convite' : isRegister ? 'Comece sua obra' : 'Bem-vindo de volta'}
          </h1>
          <p className="auth-lead">
            {isWaitlist
              ? 'O Petricor está abrindo aos poucos. Deixe seu contato e enviamos um convite assim que houver vaga.'
              : isRegister
                ? 'O cadastro é por convite. Sua conta guarda seus projetos; cada projeto continua protegido pela própria senha.'
                : 'Entre para continuar de onde parou.'}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="Acesso">
            <button
              aria-selected={mode === 'login'}
              className="auth-tab"
              role="tab"
              type="button"
              onClick={() => switchMode('login')}
            >
              Entrar
            </button>
            <button
              aria-selected={isRegister || isWaitlist}
              className="auth-tab"
              role="tab"
              type="button"
              onClick={() => switchMode('register')}
            >
              Criar conta
            </button>
          </div>

          {notice && !error && <p className="auth-notice" role="status">{notice}</p>}

          {isWaitlist && hasJoinedWaitlist ? (
            <div className="auth-waitlist-done" role="status">
              <strong>Você está na lista.</strong>
              <p>
                Quando chegar sua vez, você recebe um código de convite em {email.trim()}. Com ele, é só voltar aqui
                e criar a conta.
              </p>
              <button className="inline-link" type="button" onClick={() => switchMode('register')}>
                Já tenho um convite
              </button>
            </div>
          ) : (
            <form className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
              {isRegister && (
                <label>
                  <span>Código de convite</span>
                  <input
                    autoComplete="off"
                    autoFocus={!inviteCode}
                    className="auth-invite-input"
                    maxLength={40}
                    placeholder="XXXX-XXXX-XXXX"
                    spellCheck={false}
                    onChange={(event) => setInviteCode(event.target.value)}
                    value={inviteCode}
                  />
                </label>
              )}
              {(isRegister || isWaitlist) && (
                <label>
                  <span>Nome</span>
                  <input
                    autoComplete="name"
                    autoFocus={isWaitlist || (isRegister && Boolean(inviteCode))}
                    maxLength={120}
                    placeholder="Como você assina seus livros"
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </label>
              )}
              <label>
                <span>E-mail</span>
                <input
                  autoComplete="email"
                  autoFocus={!isRegister}
                  inputMode="email"
                  maxLength={254}
                  placeholder="voce@exemplo.com"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </label>
              {isWaitlist && (
                <label>
                  <span>Conte sobre o que você escreve (opcional)</span>
                  <textarea
                    maxLength={1000}
                    placeholder="Gênero, projeto em andamento, o que você espera do Petricor…"
                    rows={3}
                    onChange={(event) => setWaitlistMessage(event.target.value)}
                    value={waitlistMessage}
                  />
                </label>
              )}
              {!isWaitlist && (
                <label>
                  <span>Senha</span>
                  <span className="auth-password">
                    <input
                      aria-describedby={isRegister ? 'password-hint' : undefined}
                      aria-invalid={passwordTooShort || undefined}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      maxLength={256}
                      onChange={(event) => setPassword(event.target.value)}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={showPassword}
                      className="auth-password-toggle"
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </span>
                  {isRegister && (
                    <small className={`auth-hint${passwordTooShort ? ' is-error' : ''}`} id="password-hint">
                      Pelo menos {minPasswordLength} caracteres.
                    </small>
                  )}
                </label>
              )}
              {isRegister && (
                <label>
                  <span>Confirme a senha</span>
                  <input
                    aria-invalid={mismatch || undefined}
                    autoComplete="new-password"
                    maxLength={256}
                    onChange={(event) => setConfirmation(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    value={confirmation}
                  />
                  {mismatch && <small className="auth-hint is-error">As senhas não coincidem.</small>}
                </label>
              )}

              {error && <p className="form-message auth-error" role="alert">{error}</p>}

              <button className="button button-primary auth-submit" disabled={!canSubmit || isSubmitting} type="submit">
                {isSubmitting
                  ? isWaitlist ? 'Enviando…' : isRegister ? 'Criando conta…' : 'Entrando…'
                  : isWaitlist ? 'Entrar na lista de espera' : isRegister ? 'Criar conta' : 'Entrar'}
              </button>
            </form>
          )}

          <p className="auth-switch">
            {isWaitlist ? (
              <>
                Recebeu um convite?{' '}
                <button className="inline-link" type="button" onClick={() => switchMode('register')}>
                  Criar conta
                </button>
              </>
            ) : isRegister ? (
              <>
                Não tem convite?{' '}
                <button className="inline-link" type="button" onClick={() => switchMode('waitlist')}>
                  Entre na lista de espera
                </button>
              </>
            ) : (
              <>
                Ainda não tem uma conta?{' '}
                <button className="inline-link" type="button" onClick={() => switchMode('register')}>
                  Criar conta
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  )
}
