<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 반영 대기 중인 작업

RLS 마이그레이션(`009_rls.sql`, `010_grants.sql`)이 커밋돼 있지만 **운영 DB에는 아직 반영되지 않았습니다.** 반영 전까지는 URL만 알면 남의 근무기록을 조회할 수 있는 상태입니다.

운영 DB 권한이 있는 분은 `docs/rls-deploy-runbook.md`를 읽고 진행해 주세요. 마이그레이션 체인이 운영 DB의 출처가 아니라서 그냥 `db push`하면 안 됩니다 — 런북에 원격 이력 대조 절차가 있습니다.

DB 스키마를 건드리는 작업을 하기 전에도 이 런북을 먼저 확인하세요. 반영이 끝나면 이 절과 런북을 지우면 됩니다.
