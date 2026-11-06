-- An exam keeps its own set of questions. They are written in the exam flow, are never listed under Quests, and are locked once candidates start.
alter table quizzes add column kind text not null default 'quest' check (kind in ('quest','exam'));
create index quizzes_owner_kind on quizzes(owner_id, kind, updated_at desc);
