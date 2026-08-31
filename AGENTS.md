<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 이어받는 분께 (2026-08-29)

이 브랜치(`feature/refactoring`)는 **원격에 푸시되지 않았고**, RLS 마이그레이션도 **운영 DB에 반영되지 않았습니다.** 작성자에게 저장소 쓰기 권한과 운영 DB 권한이 모두 없었습니다.

- **`docs/handoff.md`** — 브랜치에 뭐가 들어 있는지, 무엇이 막혀 있는지, 남은 작업은 무엇인지. **먼저 여기부터 보세요.**
- **`docs/rls-deploy-runbook.md`** — 운영 DB 반영 절차. `016`·`017`·`018`·`019`를 올립니다.

반영 전까지는 URL만 알면 남의 근무기록을 조회할 수 있는 상태입니다. 다만 마이그레이션 체인이 운영 DB의 출처가 아니라서 **그냥 `db push`하면 안 됩니다** — 런북에 원격 이력 대조 절차가 있습니다.

DB 스키마를 건드리는 작업을 하기 전에도 런북을 먼저 확인하세요. 반영과 푸시가 끝나면 이 절과 위 두 문서를 지우면 됩니다.
