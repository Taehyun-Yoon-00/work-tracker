'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { fetchSubstituteHolidays } from '../lib/holidays'
import { DEFAULT_SETTLEMENT_TYPE, type SettlementTypeKey } from '../lib/settlement/types'
import SettlementTabs from '../components/settlement/SettlementTabs'
import DomesticSettlement from '../components/settlement/domestic/DomesticSettlement'
import SettlementAdmin from '../components/settlement/admin/SettlementAdmin'

/** ?date=YYYY-MM-DD (근무기록에서 넘어올 때). 형식이 틀리면 무시한다. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const d = dayjs(value)
  return d.isValid() ? d.toDate() : undefined
}

function SettlementContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialDate = parseDateParam(searchParams.get('date'))

  const [type, setType] = useState<SettlementTypeKey>(DEFAULT_SETTLEMENT_TYPE)
  const [ready, setReady] = useState(false)
  // 직급(마이페이지 profiles.position)은 읽기만 한다. 변경은 마이페이지에서.
  const [position, setPosition] = useState<string | null>(null)
  // 총괄 관리자/마스터 여부 — 관리 탭 노출에만 쓴다. (쓰기 API가 서버에서 권한을 다시 확인한다)
  const [isAdmin, setIsAdmin] = useState(false)
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const [{ data: profile }, { data: generalAdminRow }, holidays] = await Promise.all([
        supabase.from('profiles').select('position, is_master').eq('id', user.id).single(),
        supabase.from('general_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
        fetchSubstituteHolidays(),
      ])
      setPosition(profile?.position ?? null)
      setIsAdmin(!!profile?.is_master || !!generalAdminRow)
      setSubstituteHolidays(holidays)
      setReady(true)
    }
    load()
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold dark:text-white">출장 정산</h1>
        </div>

        <SettlementTabs value={type} onChange={setType} isAdmin={isAdmin} />

        {!ready ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-10">불러오는 중...</p>
        ) : (
          // 탭을 바꾸면 화면 전체가 해당 유형의 화면으로 바뀐다.
          (() => {
            switch (type) {
              case 'domestic':
                return (
                  <DomesticSettlement
                    initialDate={initialDate}
                    position={position}
                    substituteHolidays={substituteHolidays}
                  />
                )
              case 'overseas':
                // 아직 비활성(탭에서 선택할 수 없음). 해외 출장 화면이 생기면 여기에 연결한다.
                return null
              case 'admin':
                return isAdmin ? <SettlementAdmin /> : null
            }
          })()
        )}
      </div>
    </div>
  )
}

export default function SettlementPage() {
  return (
    <Suspense fallback={null}>
      <SettlementContent />
    </Suspense>
  )
}
