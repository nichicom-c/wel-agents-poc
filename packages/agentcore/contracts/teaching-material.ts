import { z } from "zod";

/**
 * Knowledge Review 画面の専門職コメントから生成する教材候補の構造化出力。
 * `title` / `learning_objective` / `teaching_points` の3項目で、指導者が何を教えるべきかを
 * 一目で把握できるようにする。
 */
export const teachingMaterialOutputSchema = z.object({
  title: z.string().min(1).describe("教材候補のタイトル（短い見出し）。"),
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
});

export type TeachingMaterialOutput = z.infer<
  typeof teachingMaterialOutputSchema
>;
