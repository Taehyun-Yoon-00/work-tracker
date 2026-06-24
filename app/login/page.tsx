'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isVerificationSent, setIsVerificationSent] = useState(false)

  const handleAuth = async () => {
    setLoading(true)
    setMessage('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (error) {
        setMessage(error.message)
      } else {
        setIsVerificationSent(true)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message === 'Email not confirmed') {
          setMessage('이메일 인증이 필요해요. 받은 편지함을 확인해주세요.')
        } else {
          setMessage('이메일 또는 비밀번호가 올바르지 않아요.')
        }
      } else {
        router.push('/')
      }
    }

    setLoading(false)
  }

  // 인증 메일 발송 완료 화면
  if (isVerificationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="bg-white dark:bg-zinc-800 p-8 rounded-xl shadow-md w-full max-w-md text-center">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="text-xl font-bold mb-2 dark:text-white">인증 메일을 보냈어요!</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-1">
            <span className="font-medium text-gray-700 dark:text-zinc-200">{email}</span>
          </p>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
            받은 편지함에서 인증 링크를 클릭하면 가입이 완료돼요.
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mb-4">
            메일이 오지 않으면 스팸 폴더를 확인해주세요.
          </p>
          <button
            onClick={() => {
              setIsVerificationSent(false)
              setIsSignUp(false)
              setMessage('')
            }}
            className="text-sm text-blue-500 hover:underline"
          >
            로그인 화면으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
      <div className="bg-white dark:bg-zinc-800 p-8 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 dark:text-white">
          {isSignUp ? '회원가입' : '로그인'}
        </h1>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 dark:placeholder-gray-400"
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          className="w-full border rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 dark:placeholder-gray-400"
        />

        {message && (
          <p className="text-sm text-center text-red-500 mb-4">{message}</p>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '처리 중...' : isSignUp ? '가입하기' : '로그인'}
        </button>

        <p
          onClick={() => { setIsSignUp(!isSignUp); setMessage('') }}
          className="text-center text-sm text-gray-500 dark:text-zinc-400 mt-4 cursor-pointer hover:underline"
        >
          {isSignUp ? '이미 계정이 있어요 → 로그인' : '계정이 없어요 → 회원가입'}
        </p>
      </div>
    </div>
  )
}
