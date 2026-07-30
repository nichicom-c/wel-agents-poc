import {
  createMaterialCandidateFromComments,
  type DecideMaterialCandidateStatusOptions,
  decideMaterialCandidateStatus,
  filterMaterialCandidates,
  type MaterialCandidate,
  type MaterialCandidateFilters,
  type MaterialCandidateStatus,
  type NewMaterialCandidateInput,
} from "../model/material-candidates.ts";
import {
  createComment,
  filterCommentsByVersion,
  type NewProfessionalCommentInput,
  type ProfessionalComment,
} from "../model/professional-comments.ts";
import type {
  SoapRecordSummary,
  SoapRecordVersion,
} from "../model/soap-records.ts";
import { versionsForRecord } from "../model/soap-records.ts";

/**
 * BFF `/api/material-candidates` 等（`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md`
 * の AWS インフラ提案を参照）はまだ存在しないため、issue #8 の UI を dummy データで先行実装する。
 * module 内の変数を DB の代わりに使い、関数の入出力（Promise を返す非同期関数）だけは将来の
 * 実 API 呼び出しに置き換えやすい形にしておく。ブラウザを再読み込みすると内容はリセットされる。
 */

const DUMMY_RECORDS: SoapRecordSummary[] = [
  {
    createdAt: "2026-07-10T09:30:00.000Z",
    createdBy: "田中 professional",
    id: "record-1",
    recordType: "support_activity",
    status: "finalized",
  },
  {
    createdAt: "2026-07-18T14:05:00.000Z",
    createdBy: "佐藤 professional",
    id: "record-2",
    recordType: "general_record",
    status: "finalized",
  },
];

const DUMMY_VERSIONS: SoapRecordVersion[] = [
  {
    createdAt: "2026-07-10T09:30:00.000Z",
    createdBy: "田中 professional",
    id: "record-1-v1",
    items: [
      {
        category: "S",
        text: "母親から「夜間の授乳がつらく、眠れていない」と発言。",
      },
      {
        category: "O",
        text: "児は生後2ヶ月、体重増加は標準曲線内。母親の表情に疲労が見られる。",
      },
      {
        category: "A",
        text: "産後の睡眠不足による疲労蓄積のリスクがあると考えられる。",
      },
      {
        category: "P",
        text: "次回訪問までの家事・育児支援サービスの利用を提案する。",
      },
    ],
    recordId: "record-1",
    source: "soap_draft_ai",
    versionNo: 1,
  },
  {
    createdAt: "2026-07-12T11:00:00.000Z",
    createdBy: "田中 professional",
    id: "record-1-v2",
    items: [
      {
        category: "S",
        text: "母親から「夜間の授乳がつらく、眠れていない」と発言。",
      },
      {
        category: "O",
        text: "児は生後2ヶ月、体重増加は標準曲線内。母親の表情に疲労が見られる。",
      },
      {
        category: "A",
        text: "産後の睡眠不足による疲労蓄積のリスクがあると考えられる。パートナーの育児参加状況は未確認。",
      },
      {
        category: "P",
        text: "次回訪問までの家事・育児支援サービスの利用を提案する。パートナーの育児参加状況を次回確認する。",
      },
    ],
    recordId: "record-1",
    source: "manual",
    versionNo: 2,
  },
  {
    createdAt: "2026-07-18T14:05:00.000Z",
    createdBy: "佐藤 professional",
    id: "record-2-v1",
    items: [
      {
        category: "S",
        text: "本人から「一人で買い物に行くのが不安になってきた」と発言。",
      },
      {
        category: "O",
        text: "室内での歩行は安定しているが、屋外歩行時にふらつきが見られる。",
      },
      {
        category: "A",
        text: "屋外での活動範囲縮小により、社会的孤立のリスクが高まっている。",
      },
      {
        category: "P",
        text: "地域の見守り・移動支援サービスの利用について本人・家族と相談する。",
      },
    ],
    recordId: "record-2",
    source: "soap_draft_ai",
    versionNo: 1,
  },
];

const DUMMY_COMMENTS: ProfessionalComment[] = [
  createComment({
    authorName: "鈴木 reviewer",
    authorRole: "reviewer",
    body:
      "パートナーの育児参加状況を確認する視点は良い。次回訪問前に確認項目リストへ入れておくと" +
      "他のケースでも再利用できる。",
    commentType: "review",
    soapCategory: "P",
    targetRecordId: "record-1",
    targetRecordVersionId: "record-1-v2",
  }),
  createComment({
    authorName: "鈴木 reviewer",
    authorRole: "reviewer",
    body:
      "v1 では『疲労蓄積のリスク』止まりだったが、v2 でパートナーの育児参加という具体的な" +
      "追加確認事項が入ったことで支援方針が一段具体化した。この「A の後にもう一段掘る」思考経路は" +
      "新人向けの教材になりそう。",
    commentType: "case_study",
    soapCategory: "A",
    targetRecordId: "record-1",
    targetRecordVersionId: "record-1-v2",
  }),
  createComment({
    authorName: "高橋 nurse",
    authorRole: "nurse",
    body:
      "屋外歩行時のふらつきという O の記載から、社会的孤立という A に飛ぶ論理を、次回は" +
      "「外出頻度の変化」のような中間の O も併記すると根拠が伝わりやすい。",
    commentType: "instruction_note",
    soapCategory: "A",
    targetRecordId: "record-2",
    targetRecordVersionId: "record-2-v1",
  }),
];

let candidates: MaterialCandidate[] = [
  {
    commentIds: [DUMMY_COMMENTS[1]?.id ?? ""],
    createdAt: "2026-07-19T10:00:00.000Z",
    createdBy: "鈴木 reviewer",
    difficultyId: "intermediate",
    id: "candidate-1",
    learningThemeId: "support-planning",
    recordType: "support_activity",
    specialtyId: "maternal-child",
    status: "candidate",
    statusHistory: [
      {
        changedAt: "2026-07-19T10:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: null,
        toStatus: "candidate",
      },
    ],
    summary:
      "アセスメントで一段掘り下げて追加確認事項を具体化し、支援方針を精緻化する思考経路の例。",
    title: "「疲労蓄積」から一段掘り下げるアセスメントの型",
  },
  {
    commentIds: [DUMMY_COMMENTS[2]?.id ?? ""],
    createdAt: "2026-07-19T10:30:00.000Z",
    createdBy: "高橋 nurse",
    difficultyId: "beginner",
    id: "candidate-2",
    learningThemeId: "documentation",
    recordType: "general_record",
    specialtyId: "elderly-care",
    status: "approved",
    statusHistory: [
      {
        changedAt: "2026-07-19T10:30:00.000Z",
        changedBy: "高橋 nurse",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-20T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        toStatus: "approved",
      },
    ],
    summary:
      "O と A の間に中間の観察事項を挟むことで根拠を伝わりやすくする記録表現の例。",
    title: "O から A への飛躍を防ぐ中間観察の書き方",
  },
  {
    commentIds: [],
    createdAt: "2026-07-15T09:00:00.000Z",
    createdBy: "田中 professional",
    difficultyId: "beginner",
    id: "candidate-3",
    learningThemeId: "assessment-basics",
    recordType: "meeting",
    specialtyId: "public-health",
    status: "rejected",
    rejectionReasonCode: "personal_identifiable_info",
    statusHistory: [
      {
        changedAt: "2026-07-15T09:00:00.000Z",
        changedBy: "田中 professional",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-16T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        reasonCode: "personal_identifiable_info",
        reasonText:
          "会議メモに世帯名がそのまま残っていたため。匿名化して再提出を検討。",
        toStatus: "rejected",
      },
    ],
    summary: "会議記録から抽出した支援方針決定の経緯（要匿名化）。",
    title: "多職種会議での方針転換プロセス",
  },
  {
    commentIds: [],
    createdAt: "2026-07-22T13:00:00.000Z",
    createdBy: "佐藤 professional",
    difficultyId: "advanced",
    id: "candidate-4",
    learningThemeId: "risk-detection",
    recordType: "summary",
    specialtyId: "mental-health",
    status: "needs_revision",
    statusHistory: [
      {
        changedAt: "2026-07-22T13:00:00.000Z",
        changedBy: "佐藤 professional",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-23T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        reasonText:
          "サマリー1件だけでは判断根拠が弱いため、類似ケースをもう1件追加してほしい。",
        toStatus: "needs_revision",
      },
    ],
    summary: "リスクの早期発見に繋がったサマリー記録の抜粋。",
    title: "サマリーからのリスク兆候の読み取り",
  },
];

let comments: ProfessionalComment[] = [...DUMMY_COMMENTS];

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export async function listMaterialCandidates(
  filters: MaterialCandidateFilters = {},
): Promise<MaterialCandidate[]> {
  return delay(filterMaterialCandidates(candidates, filters));
}

export async function decideCandidateStatus(
  id: string,
  nextStatus: MaterialCandidateStatus,
  changedBy: string,
  options: DecideMaterialCandidateStatusOptions = {},
): Promise<MaterialCandidate[]> {
  candidates = decideMaterialCandidateStatus(
    candidates,
    id,
    nextStatus,
    changedBy,
    options,
  );
  return delay(candidates);
}

export async function createCandidateFromComments(
  input: NewMaterialCandidateInput,
): Promise<MaterialCandidate[]> {
  candidates = createMaterialCandidateFromComments(candidates, input);
  return delay(candidates);
}

export async function listSoapRecords(): Promise<SoapRecordSummary[]> {
  return delay(DUMMY_RECORDS);
}

export async function listVersionsForRecord(
  recordId: string,
): Promise<SoapRecordVersion[]> {
  return delay(versionsForRecord(DUMMY_VERSIONS, recordId));
}

export async function listCommentsForVersion(
  targetRecordVersionId: string,
): Promise<ProfessionalComment[]> {
  return delay(filterCommentsByVersion(comments, targetRecordVersionId));
}

export async function postComment(
  input: NewProfessionalCommentInput,
): Promise<ProfessionalComment> {
  const created = createComment(input);
  comments = [...comments, created];
  return delay(created);
}

export function getCommentById(id: string): ProfessionalComment | undefined {
  return comments.find((comment) => comment.id === id);
}
