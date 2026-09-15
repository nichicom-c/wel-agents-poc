-- Knowledge Review 画面の教材候補生成 agent（AgentCore `type: "teaching_material"`）が
-- 専門職コメントから生成する構造化出力（title / learning_objective / teaching_points）のうち、
-- title は既存の material_candidates.title をそのまま使い、残り2項目を保存する列を追加する。
-- どちらも既存データ・既存フローとの互換のため任意（NULL 許容）。

alter table material_candidates
  add column learning_objective text,
  add column teaching_points jsonb;
