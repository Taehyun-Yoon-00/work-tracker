# 근무관리 시스템 (work-tracker)

근무 시간·휴가·원격근무를 기록하고 결재까지 처리하는 모바일 우선 PWA입니다.

## 주요 기능

- **근무 기록** — 달력에서 날짜를 선택해 출퇴근 시각과 휴게시간을 기록합니다. 하루 안에서 안건별로 시간을 나눠 입력할 수 있고(`수주 / 자사업무 / 타부서업무 / 영업지원 / 청구안건`), 익일 퇴근도 지원합니다.
- **휴가 / 원격근무 / 시차출근** — 연차·반차·특휴를 날짜별로 등록하고, 주차별 출근 예정 시각(8시/9시)을 계획합니다. 한국 공휴일과 사내 대체공휴일이 달력에 함께 표시됩니다.
- **결재** — 휴가·원격근무·휴일근무를 신청하면 결재권자가 승인/반려합니다. 승인된 건에 대한 취소 요청 흐름도 지원합니다. 진행 상황은 이메일과 웹 푸시로 알립니다.
- **팀** — 팀 생성과 가입 승인, 팀원별 근무시간 집계를 제공합니다.
- **리포트** — 안건별 근무시간을 월 단위(전월 16일 ~ 당월 15일)로 집계합니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (PostgreSQL + Auth) · Resend(메일) · web-push(알림) · next-pwa

## 시작하기

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인합니다.

### 환경변수

프로젝트 루트에 `.env.local`을 만들고 아래 값을 채웁니다.

| 변수                            | 용도                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저에서 쓰는 anon key                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | 서버 전용. RLS를 우회하므로 API 라우트 밖으로 노출하지 말 것 |
| `NEXT_PUBLIC_APP_URL`           | 메일 본문 링크에 쓰이는 앱 주소                              |
| `RESEND_API_KEY`                | 결재 알림 메일 발송                                          |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | 웹 푸시 공개키                                               |
| `VAPID_PRIVATE_KEY`             | 웹 푸시 비밀키                                               |
| `VAPID_MAILTO`                  | 웹 푸시 연락처 (`mailto:` 형식)                              |

VAPID 키 쌍은 `npx web-push generate-vapid-keys`로 생성합니다.

### 데이터베이스

스키마는 `supabase/migrations/`에 번호 순으로 들어 있습니다.

로컬에서 먼저 확인합니다 (Docker Desktop 실행 필요). `supabase start`가 001부터 전부 재생하고, 이어서 RLS 정책 테스트를 돌립니다.

```bash
npx supabase start
docker cp supabase/tests/rls_test.sql supabase_db_yth:/tmp/rls_test.sql
docker exec supabase_db_yth psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls_test.sql
```

`ok` 15줄이 나오고 에러가 없으면 통과입니다. 그 뒤 연결된 프로젝트에 적용합니다.

```bash
npx supabase db push
```

> 롤별 테이블 권한은 `010_grants.sql`에 있습니다. RLS 정책(009)과 테이블 권한은 별개의 관문이라 둘 다 있어야 하는데, 009까지는 권한 쪽이 파일에 없어서(운영 DB는 대시보드가 만들어 줌) 이 파일들만으로 만든 새 DB는 앱이 동작하지 않았습니다. 010에는 앞으로 추가할 테이블에 같은 권한이 자동으로 붙도록 `ALTER DEFAULT PRIVILEGES`도 들어 있습니다.

## 스크립트

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run start    # 빌드 결과 실행
npm run lint     # ESLint
npm run format   # Prettier 적용
```

## 알아둘 점

- **서비스워커** — 푸시와 알림 클릭 처리는 `worker/index.js`에서 관리합니다. `public/sw.js`는 빌드마다 next-pwa가 새로 생성하므로 직접 수정하면 사라집니다.
- **PWA는 개발 모드에서 비활성** — `next.config.ts`에서 `NODE_ENV === 'development'`일 때 꺼집니다. 푸시 동작을 확인하려면 빌드 후 `npm run start`로 실행해야 합니다.
- **RLS** — 브라우저가 anon key로 테이블을 직접 쿼리하므로 접근 제어는 DB 정책에 의존합니다. `supabase/migrations/009_rls.sql`이 전 테이블의 정책을 정의하며, **아직 운영 DB에 적용하지 않았다면** 해당 파일 하단의 확인 절차를 먼저 따르세요. 적용 전까지는 URL만 알면 남의 근무기록을 조회할 수 있습니다.

## 배포

Vercel에 배포됩니다. 위 환경변수를 프로젝트 설정에 동일하게 등록해야 합니다.
