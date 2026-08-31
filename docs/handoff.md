# 인계 메모 — `feature/refactoring`

이 브랜치는 **원격에 올라가 있지 않습니다.** 작성자에게 저장소 쓰기 권한과 운영 DB 권한이 모두 없어서, 이어받을 사람이 볼 수 있도록 상태를 여기 적어둡니다.

작성 2026-08-29 기준 · 브랜치 `feature/refactoring` · `main` 대비 20 커밋 (68 파일, +4250 −1355)

---

## 지금 막혀 있는 것 두 가지

### 1. 푸시 — 저장소 쓰기 권한 없음

```
git push -u origin feature/refactoring
→ remote: Permission to Taehyun-Yoon-00/work-tracker.git denied to rawool814.
   fatal: ... 403
```

이 PC의 git 자격증명은 `rawool814`인데 origin은 `Taehyun-Yoon-00/work-tracker`입니다. 권한이 생기면 위 명령 한 번으로 20커밋이 전부 올라갑니다. `gh` CLI는 설치돼 있지 않아 포크·PR 생성도 자동화할 수 없습니다.

### 2. RLS 운영 반영 — 운영 DB 권한 없음

**반영 전까지는 URL만 알면 남의 근무기록을 조회할 수 있습니다.** 마이그레이션 `016`~`019`가 커밋돼 있고 로컬 검증(15/15)까지 끝났지만 운영에는 올라가지 않았습니다.

절차는 `docs/rls-deploy-runbook.md`에 있습니다. **그냥 `db push` 하면 안 됩니다** — 마이그레이션 체인이 운영 DB의 출처가 아니라서, 원격 이력 대조가 먼저입니다.

---

## 이 브랜치에 뭐가 들어 있나

크게 세 덩어리입니다.

**리팩토링 · 문서 (`9887df7` ~ `b461670`)**
Prettier 도입과 일괄 포맷, 공통 타입/훅/UI 컴포넌트 분리와 `any` 제거, 표시 이름·날짜 계산 중복 제거, README 재작성.

**보안 (`6209cb0` ~ `924119a`, `4548438`)**
로컬 Supabase 스택 구성, 중복 마이그레이션 003 정리, RLS 전면 적용, `is_master` 권한 상승 차단 트리거, API 라우트 호출자 인증, 롤별 GRANT 명시, 강제 탈퇴의 클라이언트 대량 삭제 제거와 DELETE 정책 축소.

**UI (`ed4c9a6` ~ `74c1307`)**
`redesign-existing-projects` 스킬로 8개 페이지를 감사하고 고친 결과입니다. 조회 실패를 화면에 드러내기, 다크모드 누락 보완, `alert`/`confirm` 13곳을 `ConfirmDialog`로 교체, 포커스 링 전역화, 로딩 스켈레톤, 레이아웃·문구 정리, ESLint 에러 24개 해소.

## 이어받을 때 알아두면 좋은 것

- **`AGENTS.md`** 를 먼저 보세요. 이 저장소의 Next.js는 학습 데이터와 다를 수 있어 `node_modules/next/dist/docs/`를 읽고 코드를 쓰라는 규칙이 있습니다.
- **로컬 검증 환경**은 `README.md`의 "데이터베이스" 절에 있습니다. `supabase start` → `db reset` → `rls_test.sql` 순서입니다.
- **`rls_test.sql`은 빈 DB에서 돌려야 합니다.** 조회 범위를 절대 건수로 확인하므로 데이터가 남아 있으면 개수가 어긋나 실패합니다.
- **`.env.local`이 없으면 `npm run build`가 page data 수집 단계에서 멈춥니다.** 파일을 만들지 말고 그 명령에만 더미 값을 주입하세요. VAPID 키는 형식 검증이 있어 `npx web-push generate-vapid-keys --json`으로 만들어야 합니다.
- **`.next`를 지울 때는 dev 서버를 먼저 끄세요.** 같은 디렉터리를 쓰기 때문에 실행 중에 지우면 `Internal Server Error`가 납니다.

## 검증 상태

| 항목                   | 결과                                               |
| ---------------------- | -------------------------------------------------- |
| `npx tsc --noEmit`     | 통과                                               |
| `npm run build`        | 15개 라우트 성공                                   |
| `npx eslint app`       | **0 errors** / 20 warnings                         |
| `rls_test.sql` (빈 DB) | 15/15                                              |
| 브라우저 확인          | 로컬 Supabase + 시드 데이터로 8개 페이지 육안 확인 |

남은 경고 20개: `react-hooks/exhaustive-deps` 10, 미사용 변수 9, `@next/next/no-img-element` 1(TopNav 로고).

**브라우저 확인의 한계** — 로컬 스택에 임시 사용자와 시드 데이터를 넣고 본 것이라, 실제 운영 데이터의 규모나 예외 상황은 확인하지 못했습니다. 메일 발송(Resend)과 웹 푸시는 로컬에서 확인하지 않았습니다.

## 아직 남은 작업

**보안 관련**

- `anon` 롤의 테이블 권한 회수 — Supabase 대시보드 기본값이 `anon`에게도 ALL을 줍니다. `017_grants.sql`은 새로 주지 않을 뿐 기존 권한을 회수하지 않으므로 **운영의 anon 권한은 그대로입니다.** 009의 정책이 전부 `TO authenticated`라 실제 접근은 막히지만, 관문을 하나 더 두려면 REVOKE를 별건으로 검토하세요.

**UI · 코드 품질**

- 데스크톱 레이아웃 — `max-w-2xl`(672px) 안에 react-calendar가 고정 폭으로 왼쪽에 붙어 오른쪽이 빕니다. 모바일 우선 설계라 의도적일 수 있으나 PC에서는 카드 절반이 비어 보입니다.
- `/`(근무기록)와 `/team/[id]`의 로딩 상태 — 폼·달력 위주라 목록형 스켈레톤이 맞지 않아 비워뒀습니다.
- effect 패턴이 섞여 있습니다 — ESLint 해소는 대부분 "선언 뒤로 이동 + `void Promise.resolve().then(...)`" 최소 변경으로 했고, `app/report/page.tsx`만 로딩을 파생값으로 바꾸고 조회 함수에서 상태를 분리하는 방식으로 더 손봤습니다. 통일하려면 리포트를 본보기로 삼으세요.
- 남은 경고 20개.

**반영이 끝나면**

`AGENTS.md`의 "이어받는 분께" 절, `docs/rls-deploy-runbook.md`, 그리고 이 파일을 지우면 됩니다.
