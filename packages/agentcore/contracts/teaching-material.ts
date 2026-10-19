import { z } from "zod";

/** 分類マスタ（分野 / 学習テーマ / 難易度）の選択肢1件。`id` は BFF 側 DB の FK。 */
export type TeachingMaterialOption = {
  id: string;
  label: string;
};

/**
 * 教材候補の分類として model に選ばせる選択肢。AgentCore は DB を触らないため、
 * BFF が `GET /api/masters` と同じマスタを読んで payload で渡す。
 */
export type TeachingMaterialClassificationOptions = {
  specialties: TeachingMaterialOption[];
  learningThemes: TeachingMaterialOption[];
  difficultyLevels: TeachingMaterialOption[];
};

/**
 * Knowledge Review 画面の専門職コメントから生成する教材候補の構造化出力。
 * `title` / `summary` / `learning_objective` / `teaching_points` の4項目で、指導者が何を
 * 教えるべきかを一目で把握できるようにする。加えて、BFF から分類の選択肢を渡された場合は
 * 分野 / 学習テーマ / 難易度の推奨値（マスタの id）も返す。
 */
export const teachingMaterialOutputSchema = z.object({
  title: z.string().min(1).describe("教材候補のタイトル（短い見出し）。"),
  summary: z
    .string()
    .min(1)
    .describe(
      "教材候補の要約。どの場面の何についての教材かを1〜2文で述べる（学習目標の言い換えにしない）。",
    ),
  learningObjective: z
    .string()
    .min(1)
    .describe("この教材候補で新人が身につけるべき学習目標。1〜2文で具体的に。"),
  teachingPoints: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "指導のポイント（教えるべきこと）の一覧。コメント本文に含まれる指摘・助言を、" +
        "個別に指導できる粒度の短い箇条書きに分解する。",
    ),
  specialtyId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "入力で与えられた分野の選択肢のうち最も適合するものの id。" +
        "選択肢が無い、またはどれも当てはまらない場合は省略する。",
    ),
  learningThemeId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "入力で与えられた学習テーマの選択肢のうち最も適合するものの id。" +
        "選択肢が無い、またはどれも当てはまらない場合は省略する。",
    ),
  difficultyId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "入力で与えられた難易度の選択肢のうち最も適合するものの id。" +
        "選択肢が無い、またはどれも当てはまらない場合は省略する。",
    ),
});

export type TeachingMaterialOutput = z.infer<
  typeof teachingMaterialOutputSchema
>;
