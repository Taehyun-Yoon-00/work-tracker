# RLS 운영 반영 런북

**상태: 미반영.** 이 브랜치(`feature/refactoring`)에 RLS 마이그레이션이 들어 있지만 운영 DB에는 아직 적용되지 않았습니다. 작성자에게 운영 DB 권한이 없어, 권한을 가진 사람이 이어받도록 절차를 남깁니다.

작성일 2026-08-28.

## 왜 급한가

지금 운영 DB의 대부분 테이블에는 RLS가 없습니다. 브라우저가 anon key로 테이블을 직접 조회하는 구조라, **접근 제어가 클라이언트 코드에만 있습니다.** URL과 팀 id만 알면 로그인한 아무 계정으로나 남의 근무기록·휴가·팀 정보를 읽을 수 있습니다.

`002`/`003`(notifications)과 `004`(push_subscriptions)에만 RLS가 걸려 있었고, 나머지는 열려 있습니다.

## 무엇을 반영하는가

| 파일                                 | 내용                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `supabase/migrations/009_rls.sql`    | 전 테이블 RLS 정책 39개 + 헬퍼 함수 + `is_master` 권한 상승 차단 트리거 |
| `supabase/migrations/010_grants.sql` | 롤별 테이블 권한(GRANT). 정책과 별개의 관문이라 둘 다 필요              |
| `supabase/tests/rls_test.sql`        | 정책 검증 스크립트(단언 14개)                                           |

관련 커밋: `3aa5e7b`(중복 003 정리), `bc17ca2`(RLS), `c4208d2`(API 라우트 호출자 인증), `8f7ff10`(문서).

정책이 반영하는 접근 모델은 `009_rls.sql` 상단 주석에 있습니다. 요약하면 — 본인 데이터는 본인이, 같은 팀의 근무/휴가/원격근무/출근계획은 팀원이 읽기, 팀 관리는 팀장, 마스터 계정은 전체, 서버 API 라우트는 service_role로 RLS 우회.

## ⚠️ 적용 전에 반드시 확인할 것

**`supabase/migrations/`는 운영 DB의 출처가 아닙니다.** 운영 DB는 Supabase 대시보드로 만들어졌고 마이그레이션 파일은 사후에 기록된 것으로 보입니다. 2026-08-28에 로컬에서 001부터 재생해 확인한 근거가 두 가지 있습니다.

1. `003_notifications.sql`이 `002`와 바이트 단위로 동일한 중복이었습니다(`CREATE POLICY`는 `IF NOT EXISTS`가 없어 재생 시 42710으로 멈춥니다). → `3aa5e7b`에서 003을 no-op으로 교체했습니다.
2. 어느 파일에도 `GRANT`문이 없었습니다. 운영은 대시보드가 권한을 만들어 줘서 동작 중이었습니다. → `010_grants.sql`로 명시했습니다.

**따라서 운영 스키마가 파일과 다를 수 있습니다.** `db push` 전에 원격 이력을 반드시 대조하세요.

```bash
npx supabase login
npx supabase link --project-ref <프로젝트 ref>
npx supabase migration list          # 원격에 무엇이 기록돼 있는지 확인
```

`migration list`에서 로컬에만 있는 항목이 009/010 외에 더 있다면, 그것들이 운영에 이미 반영된 내용인지 먼저 판단해야 합니다. 이미 반영된 것을 다시 밀면 `CREATE POLICY` 중복(42710)이나 `CREATE TABLE` 충돌로 멈춥니다. 그런 경우 `supabase migration repair --status applied <version>`으로 이력만 맞춘 뒤 진행하세요.

## 절차

### 1. 로컬에서 먼저 재생 (Docker Desktop 필요)

```bash
npx supabase start
npx supabase db reset
docker cp supabase/tests/rls_test.sql supabase_db_yth:/tmp/rls_test.sql
docker exec supabase_db_yth psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls_test.sql
```

`ok` 15줄이 나오고 에러가 없으면 통과입니다. 2026-08-29 기준 15/15 통과를 확인했습니다.

> Windows 참고: `supabase/config.toml`에서 analytics(logflare)·studio·storage를 꺼뒀습니다. analytics가 unhealthy로 뜨면 `supabase start`가 스택 전체를 내려버려서입니다.

### 2. 스테이징이 있다면 스테이징에 먼저

없다면 운영 반영 직전에 DB 백업(Supabase 대시보드 → Database → Backups)을 확인하세요.

### 3. 운영 반영

```bash
npx supabase db push
```

### 4. 반영 직후 확인

**되는지** — 계정 두 개 이상으로 확인합니다.

- [ ] 근무기록 저장/수정/삭제, 안건별 공수 저장
- [ ] 휴가/원격근무 토글, 주차별 출근계획 저장
- [ ] 팀 생성 → 다른 계정으로 가입 신청 → 팀장이 승인
- [ ] 팀 상세에서 팀원의 주간/월간 근무시간이 보이는지
- [ ] 결재 신청 → 결재권자 계정에서 승인/반려 → 취소 요청
- [ ] 리포트 페이지 합계가 나오는지
- [ ] 마스터 계정의 회원 목록 / 대체공휴일 등록 / 강제 탈퇴

**막히는지** (이번 작업의 목적)

- [ ] 같은 팀이 아닌 계정으로 `/team/<남의 팀 id>`를 열면 팀원 목록과 근무기록이 비어 보인다
- [ ] 일반 계정이 마이페이지에서 자기 `is_master`를 켤 수 없다

### 5. 문제가 생기면 (롤백)

정책을 지우지 않고 즉시 원복할 수 있습니다.

```sql
ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
```

대상 테이블: `profiles`, `teams`, `team_members`, `team_requests`, `work_logs`, `work_log_matters`, `vacations`, `remote_works`, `commute_plans`, `approval_requests`, `substitute_holidays`.

## 알아둘 실패 양상

RLS는 **조용히 실패합니다.** 정책이 하나라도 어긋나면 에러가 아니라 해당 화면이 "데이터 없음"으로 비어 보입니다. 확인할 때 이 점을 염두에 두세요.

- **마스터가 403을 받는다** → `service_role`에 테이블 권한이 없는 경우입니다. API 라우트의 `isMaster()`가 fail-closed라 false를 반환합니다. `010_grants.sql`이 막아주지만, 010을 건너뛰면 이 증상이 나옵니다.
- **리포트/팀 화면이 비어 보인다** → 권한 오류일 수 있습니다. 리포트 페이지는 `ed4c9a6`에서 조회 실패를 "기록 없음"과 구분해 표시하도록 고쳤습니다. 다른 페이지는 아직 구분하지 않으니, 브라우저 콘솔과 Supabase 로그를 함께 보세요.

## 함께 알아둘 미해결 항목

- ~~admin 페이지의 클라이언트 대량 삭제~~ — **정리했습니다(2026-08-29).** 브라우저에서 anon key로 남의 행을 지우던 코드를 걷어냈습니다. `/api/admin/delete-user`가 이미 같은 테이블을 모두 지우고 있어 중복이었습니다. 이에 맞춰 009의 DELETE 정책에서 `is_master()` 분기를 뺐고 이름도 `*_delete_own`으로 바꿨습니다. 이제 브라우저 롤은 본인 행만 지울 수 있습니다.
- **anon 권한은 회수하지 않았습니다** — Supabase 대시보드 기본값은 `anon`에게도 테이블 ALL 권한을 줍니다. `010_grants.sql`은 anon에 권한을 주지 않을 뿐 기존 권한을 REVOKE하지 않으므로, **운영 DB의 anon 권한은 그대로 남습니다.** 009의 정책이 전부 `TO authenticated`라 실제 접근은 막히지만, 관문을 하나 더 두려면 REVOKE를 별건으로 검토하세요.
