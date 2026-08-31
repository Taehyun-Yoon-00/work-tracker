-- ============================================================
-- 미지정 그룹 단순화
--
-- 기존에는 "미지정 부문 > 미지정 부서"라는 실제 부문/부서 로우를 만들어
-- 배치 전 팀/인원을 임시로 걸어두는 방식이었다.
--
-- 이제부터 "미지정"은 실제 조직 로우가 아니라 상태(state)다:
--   - 어느 team_members 에도 없고
--   - 어느 department_memberships 에도 없는 사용자 = 미지정 인원
-- 회원가입 직후 아무 소속도 만들지 않으므로(001_init.sql) 신규 유저는
-- 자연스럽게 이 상태가 되고, 관리자가 /org 화면에서 배정하면 소속이 생긴다.
--
-- 따라서 기존 "미지정 부문/미지정 부서" 로우는 더 이상 필요 없다.
-- 혹시 그 아래에 팀이나 부서 직속 인원이 남아 있다면(운영 중 실수로 생성된 경우)
-- 전부 "미지정 상태"(연결 해제)로 되돌린 뒤 로우 자체를 삭제한다.
-- 생성일: 2026-08-29
-- ============================================================

do $$
declare
  v_division_id uuid;
  v_department_id uuid;
begin
  -- 010_org_structure.sql이 아직 적용되지 않은 환경(= divisions 테이블 자체가 없음)에서는
  -- 정리할 대상이 없으므로 조용히 종료한다.
  if to_regclass('public.divisions') is null then
    return;
  end if;

  select id into v_division_id from public.divisions where name = '미지정 부문';
  if v_division_id is null then
    return;
  end if;

  select id into v_department_id
  from public.departments
  where division_id = v_division_id and name = '미지정 부서';

  if v_department_id is not null then
    -- 이 부서에 남아있던 팀은 미배치 상태(department_id = null)로 되돌린다.
    -- (org 화면에서 department_id가 있는 팀만 노출되므로, 관리자가 재배치 전까지는
    --  기존과 동일하게 화면에는 보이지 않는다 — 다만 진짜 미지정 부서 로우에 종속되지 않는다.)
    update public.teams set department_id = null where department_id = v_department_id;

    -- 이 부서에 직접 소속돼 있던 인원은 미지정 인원 상태로 되돌린다.
    delete from public.department_memberships where department_id = v_department_id;

    -- 이 부서에 대한 결재권자 위임도 함께 정리한다.
    -- (011_department_approvers.sql이 아직 적용되지 않은 환경에서도 이 마이그레이션이
    --  안전하게 동작하도록 테이블 존재 여부를 확인한다.)
    if to_regclass('public.department_approvers') is not null then
      delete from public.department_approvers where department_id = v_department_id;
    end if;

    -- 부서장 지정도 의미가 없어지므로 삭제 전에 정리.
    delete from public.departments where id = v_department_id;
  end if;

  delete from public.divisions where id = v_division_id;
end $$;
