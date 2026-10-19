import { useEffect, useState } from "react";
import { DemoRoleSwitcher } from "@/components/demo-role-switcher";
import { OptionSelect } from "@/components/option-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  COMMENT_TYPES,
  type CommentType,
  canDecideCandidateStatus,
  canPostComment,
  canViewKnowledgeReview,
  commentTypeLabel,
  createCandidateFromComments,
  decideCandidateStatus,
  generateTeachingMaterialDraft,
  KNOWLEDGE_REVIEW_ROLES,
  type KnowledgeReviewRole,
  knowledgeReviewRoleLabel,
  listCommentsForVersion,
  listMaterialCandidates,
  listSoapRecords,
  listVersionsForRecord,
  MATERIAL_CANDIDATE_STATUSES,
  type MaterialCandidate,
  type MaterialCandidateFilters,
  materialCandidateStatusLabel,
  type ProfessionalComment,
  postComment,
  promoteCandidateToMaterial,
  type RejectionReasonCode,
  type SoapRecordSummary,
  type SoapRecordVersion,
  type TeachingMaterialDraft,
} from "../../features/knowledge-review/index.ts";
import {
  rejectionReasonLabel,
  tagLabel,
  useMasters,
} from "../../features/masters/index.ts";
import {
  SOAP_CATEGORY_ACCENTS,
  SOAP_RECORD_TYPES,
  type SoapCategory,
  soapRecordTypeLabel,
} from "../../features/soap-draft/index.ts";

type KnowledgeReviewTab = "candidates" | "records";
type LoadStatus = "idle" | "loading" | "error";

const CATEGORY_LABELS: Record<SoapCategory, string> = {
  A: "A・アセスメント",
  O: "O・客観的情報",
  P: "P・支援計画",
  S: "S・主観的情報",
  UNCLASSIFIED: "該当なし",
};

/**
 * 承認者ロールの範囲は issue #8 の Open Question のため、実際の RBAC ではなくこの demo 用
 * role をそのまま `authorRoleAtPost` / `changedByRole`（自由記述）として DB に記録する。
 */
const DEMO_ROLE_LABELS: Record<KnowledgeReviewRole, string> = {
  admin: "管理者（デモ）",
  guest: "未選択",
  nurse: "専門職（デモ）",
  reviewer: "レビュー承認者（デモ）",
  trainee: "新人保健師（デモ）",
};

const STATUS_BADGE_VARIANTS: Record<
  (typeof MATERIAL_CANDIDATE_STATUSES)[number],
  "default" | "secondary" | "destructive" | "outline"
> = {
  approved: "default",
  candidate: "secondary",
  needs_revision: "outline",
  rejected: "destructive",
};

/** マスタ配列を `OptionSelect` の options 形へ。先頭に「すべて」を足す用途も兼ねる。 */
function toOptions(
  entries: ReadonlyArray<{ id: string; label: string }>,
  allLabel?: string,
) {
  const options = entries.map((entry) => ({
    label: entry.label,
    value: entry.id,
  }));
  return allLabel ? [{ label: allLabel, value: "" }, ...options] : options;
}

/** AI が推奨した id を、マスタに実在する場合だけ select へ反映する。 */
function applyRecommendedId(
  entries: ReadonlyArray<{ id: string; label: string }>,
  recommendedId: string | undefined,
  setValue: (value: string) => void,
) {
  if (recommendedId && entries.some((entry) => entry.id === recommendedId)) {
    setValue(recommendedId);
  }
}

export function KnowledgeReviewView() {
  const [role, setRole] = useState<KnowledgeReviewRole>("nurse");
  const [activeTab, setActiveTab] = useState<KnowledgeReviewTab>("candidates");
  const canView = canViewKnowledgeReview(role);
  const canPost = canPostComment(role);
  const canDecide = canDecideCandidateStatus(role);
  const authorName = DEMO_ROLE_LABELS[role];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-std-24B-150">Knowledge Review</h2>
        <p className="text-muted-foreground text-std-16N-170">
          専門職コメントからノウハウと教材候補を蓄積する作業画面（issue #8）
        </p>
      </div>

      <DemoRoleSwitcher
        idPrefix="knowledge-review-role"
        label={knowledgeReviewRoleLabel}
        roles={KNOWLEDGE_REVIEW_ROLES}
        value={role}
        onValueChange={setRole}
      />

      {!canView ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            この画面を利用する権限がありません。ロールを「専門職」「レビュー承認者」「管理者」に切り替えてください。
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as KnowledgeReviewTab)}
        >
          <TabsList variant="line">
            <TabsTrigger value="candidates" className="flex-none px-3">
              教材候補
            </TabsTrigger>
            <TabsTrigger value="records" className="flex-none px-3">
              記録から探す
            </TabsTrigger>
          </TabsList>
          <TabsContent value="candidates">
            <CandidateTab authorName={authorName} canDecide={canDecide} />
          </TabsContent>
          <TabsContent value="records">
            <RecordTab authorName={authorName} canPost={canPost} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type CandidateTabProps = {
  authorName: string;
  canDecide: boolean;
};

function CandidateTab({ authorName, canDecide }: CandidateTabProps) {
  const masters = useMasters();
  const [filters, setFilters] = useState<MaterialCandidateFilters>({});
  const [candidates, setCandidates] = useState<MaterialCandidate[] | null>(
    null,
  );
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode | "">("");
  const [reasonText, setReasonText] = useState("");
  const [promoteError, setPromoteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    listMaterialCandidates(filters)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCandidates(result);
        setStatus("idle");
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : String(caught),
          );
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  async function refresh() {
    setCandidates(await listMaterialCandidates(filters));
  }

  async function handleDecide(
    id: string,
    next: "approved" | "rejected" | "needs_revision",
  ) {
    await decideCandidateStatus(id, next, authorName, {
      reasonCode: reasonCode || undefined,
      reasonText: reasonText.trim() || undefined,
    });
    setReasonCode("");
    setReasonText("");
    await refresh();
  }

  async function handlePromote(id: string) {
    setPromoteError("");
    try {
      await promoteCandidateToMaterial(id);
      await refresh();
    } catch (caught) {
      setPromoteError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }

  return (
    <section aria-label="教材候補一覧" className="flex flex-col gap-4">
      <FieldSet>
        <FieldLegend variant="label">検索</FieldLegend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-8">
          <Field>
            <FieldLabel htmlFor="kr-filter-specialty">分野</FieldLabel>
            <OptionSelect
              id="kr-filter-specialty"
              options={toOptions(masters.specialties, "すべて")}
              value={filters.specialtyId ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  specialtyId: value || undefined,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="kr-filter-record-type">記録種別</FieldLabel>
            <OptionSelect
              id="kr-filter-record-type"
              options={[
                { label: "すべて", value: "" },
                ...SOAP_RECORD_TYPES.map((type) => ({
                  label: soapRecordTypeLabel(type),
                  value: type,
                })),
              ]}
              value={filters.recordType ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  recordType:
                    (value as MaterialCandidateFilters["recordType"]) ||
                    undefined,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="kr-filter-theme">学習テーマ</FieldLabel>
            <OptionSelect
              id="kr-filter-theme"
              options={toOptions(masters.learningThemes, "すべて")}
              value={filters.learningThemeId ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  learningThemeId: value || undefined,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="kr-filter-difficulty">難易度</FieldLabel>
            <OptionSelect
              id="kr-filter-difficulty"
              options={toOptions(masters.difficultyLevels, "すべて")}
              value={filters.difficultyId ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  difficultyId: value || undefined,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="kr-filter-status">状態</FieldLabel>
            <OptionSelect
              id="kr-filter-status"
              options={[
                { label: "すべて", value: "" },
                ...MATERIAL_CANDIDATE_STATUSES.map((option) => ({
                  label: materialCandidateStatusLabel(option),
                  value: option,
                })),
              ]}
              value={filters.status ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  status:
                    (value as MaterialCandidateFilters["status"]) || undefined,
                }))
              }
            />
          </Field>
        </div>
      </FieldSet>

      {status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            教材候補の取得に失敗しました: {loadError}
          </AlertDescription>
        </Alert>
      ) : null}

      {candidates ? (
        <p className="text-muted-foreground text-std-16N-170">
          {candidates.length}件
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {(candidates ?? []).map((candidate) => (
          <li key={candidate.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {candidate.title}
                  <Badge variant={STATUS_BADGE_VARIANTS[candidate.status]}>
                    {materialCandidateStatusLabel(candidate.status)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-std-16N-170">{candidate.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {candidate.specialtyId
                      ? tagLabel(masters.specialties, candidate.specialtyId)
                      : "未設定"}
                  </Badge>
                  <Badge variant="outline">
                    {candidate.recordType
                      ? soapRecordTypeLabel(candidate.recordType)
                      : "未設定"}
                  </Badge>
                  <Badge variant="outline">
                    {candidate.learningThemeId
                      ? tagLabel(
                          masters.learningThemes,
                          candidate.learningThemeId,
                        )
                      : "未設定"}
                  </Badge>
                  <Badge variant="outline">
                    {candidate.difficultyId
                      ? tagLabel(
                          masters.difficultyLevels,
                          candidate.difficultyId,
                        )
                      : "未設定"}
                  </Badge>
                </div>

                {selectedId === candidate.id ? (
                  <div className="flex flex-col gap-4 border-t border-border pt-3">
                    {candidate.learningObjective ? (
                      <div className="flex flex-col gap-1">
                        <h5 className="text-std-16B-170">
                          学習目標（learning_objective）
                        </h5>
                        <p className="text-std-16N-170">
                          {candidate.learningObjective}
                        </p>
                      </div>
                    ) : null}
                    {candidate.teachingPoints &&
                    candidate.teachingPoints.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <h5 className="text-std-16B-170">
                          指導のポイント（teaching_points）
                        </h5>
                        <ul className="list-disc pl-5 text-std-16N-170">
                          {candidate.teachingPoints.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2">
                      <h5 className="text-std-16B-170">紐づく専門職コメント</h5>
                      {candidate.comments.length === 0 ? (
                        <p className="text-muted-foreground text-std-16N-170">
                          紐づくコメントはありません。
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {candidate.comments.map((comment) => (
                            <li
                              key={comment.id}
                              className="rounded-lg bg-muted px-3 py-2"
                            >
                              <div className="flex flex-wrap gap-2 text-muted-foreground text-dns-14N-130">
                                <span>
                                  {commentTypeLabel(comment.commentType)}
                                </span>
                                <span>{comment.authorName}</span>
                              </div>
                              <p className="text-std-16N-170">{comment.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <h5 className="text-std-16B-170">状態の履歴</h5>
                      <ul className="list-disc pl-5 text-muted-foreground text-std-16N-170">
                        {candidate.statusHistory.map((event) => (
                          <li key={`${event.toStatus}:${event.changedAt}`}>
                            {materialCandidateStatusLabel(event.toStatus)} —{" "}
                            {event.changedByRole}
                            {event.reasonText ? `（${event.reasonText}）` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {candidate.rejectionReasonCode ? (
                      <p className="text-muted-foreground text-std-16N-170">
                        却下理由:{" "}
                        {rejectionReasonLabel(
                          masters.rejectionReasonCodes,
                          candidate.rejectionReasonCode,
                        )}
                      </p>
                    ) : null}

                    {candidate.status === "approved" ? (
                      <div className="flex flex-col gap-2">
                        <h5 className="text-std-16B-170">教材化</h5>
                        {candidate.materialId ? (
                          <p className="text-muted-foreground text-std-16N-170">
                            教材化済み（教材ID: {candidate.materialId}）。Admin
                            の「教材」タブから確認できます。
                          </p>
                        ) : canDecide ? (
                          <>
                            <p className="text-muted-foreground text-std-16N-170">
                              issue #10 の教材（status:
                              draft）として登録します。
                            </p>
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handlePromote(candidate.id)}
                              >
                                教材にする
                              </Button>
                            </div>
                            {promoteError ? (
                              <Alert variant="destructive">
                                <AlertDescription>
                                  {promoteError}
                                </AlertDescription>
                              </Alert>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-muted-foreground text-std-16N-170">
                            教材化にはレビュー承認者または管理者の権限が必要です。
                          </p>
                        )}
                      </div>
                    ) : null}

                    {canDecide ? (
                      <div className="flex flex-col gap-3">
                        <h5 className="text-std-16B-170">状態を変更</h5>
                        <Field>
                          <FieldLabel htmlFor={`kr-reason-${candidate.id}`}>
                            却下理由（却下する場合は必須）
                          </FieldLabel>
                          <OptionSelect
                            id={`kr-reason-${candidate.id}`}
                            options={[
                              { label: "選択してください", value: "" },
                              ...masters.rejectionReasonCodes.map((option) => ({
                                label: option.label,
                                value: option.code,
                              })),
                            ]}
                            value={reasonCode}
                            onValueChange={(value) =>
                              setReasonCode(value as RejectionReasonCode | "")
                            }
                          />
                        </Field>
                        <Input
                          aria-label="補足コメント"
                          placeholder="補足コメント（要修正の場合はここに修正依頼を書く）"
                          value={reasonText}
                          onChange={(event) =>
                            setReasonText(event.target.value)
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              void handleDecide(candidate.id, "approved")
                            }
                          >
                            承認
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!reasonCode}
                            onClick={() =>
                              void handleDecide(candidate.id, "rejected")
                            }
                          >
                            却下
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!reasonText.trim()}
                            onClick={() =>
                              void handleDecide(candidate.id, "needs_revision")
                            }
                          >
                            要修正
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-std-16N-170">
                        状態の変更にはレビュー承認者または管理者の権限が必要です。
                      </p>
                    )}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelectedId((prev) =>
                      prev === candidate.id ? null : candidate.id,
                    )
                  }
                >
                  {selectedId === candidate.id ? "閉じる" : "詳細"}
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RecordTabProps = {
  authorName: string;
  canPost: boolean;
};

function RecordTab({ authorName, canPost }: RecordTabProps) {
  const masters = useMasters();
  const [records, setRecords] = useState<SoapRecordSummary[] | null>(null);
  const [recordsStatus, setRecordsStatus] = useState<LoadStatus>("idle");
  const [recordsError, setRecordsError] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [versions, setVersions] = useState<SoapRecordVersion[] | null>(null);
  const [versionsStatus, setVersionsStatus] = useState<LoadStatus>("idle");
  const [versionsError, setVersionsError] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [comments, setComments] = useState<ProfessionalComment[] | null>(null);
  const [newCommentType, setNewCommentType] = useState<CommentType>("review");
  const [newCommentBody, setNewCommentBody] = useState("");
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSummary, setCreateSummary] = useState("");
  const [createLearningObjective, setCreateLearningObjective] = useState("");
  const [createTeachingPointsText, setCreateTeachingPointsText] = useState("");
  const [createSpecialtyId, setCreateSpecialtyId] = useState("");
  const [createLearningThemeId, setCreateLearningThemeId] = useState("");
  const [createDifficultyId, setCreateDifficultyId] = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [generatedDraft, setGeneratedDraft] =
    useState<TeachingMaterialDraft | null>(null);
  const [generateStatus, setGenerateStatus] = useState<LoadStatus>("idle");
  const [generateError, setGenerateError] = useState("");

  // マスタは非同期で届くため、未選択のものだけ先頭を既定値にする（利用者の選択は上書きしない）。
  useEffect(() => {
    setCreateSpecialtyId(
      (current) => current || masters.specialties[0]?.id || "",
    );
    setCreateLearningThemeId(
      (current) => current || masters.learningThemes[0]?.id || "",
    );
    setCreateDifficultyId(
      (current) => current || masters.difficultyLevels[0]?.id || "",
    );
  }, [masters]);

  useEffect(() => {
    let cancelled = false;
    setRecordsStatus("loading");
    listSoapRecords()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRecords(result);
        setRecordsStatus("idle");
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setRecordsStatus("error");
        setRecordsError(
          caught instanceof Error ? caught.message : String(caught),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedRecordId) {
      setVersions(null);
      setSelectedVersionId(null);
      return;
    }
    let cancelled = false;
    setVersionsStatus("loading");
    setVersionsError("");
    listVersionsForRecord(selectedRecordId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setVersions(result);
        setSelectedVersionId(result[result.length - 1]?.id ?? null);
        setVersionsStatus("idle");
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setVersionsStatus("error");
        setVersionsError(
          caught instanceof Error ? caught.message : String(caught),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecordId]);

  useEffect(() => {
    if (!selectedVersionId) {
      setComments(null);
      return;
    }
    let cancelled = false;
    listCommentsForVersion(selectedVersionId).then((result) => {
      if (!cancelled) {
        setComments(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVersionId]);

  async function handlePostComment() {
    if (!selectedRecordId || !selectedVersionId || !newCommentBody.trim()) {
      return;
    }
    const body = newCommentBody.trim();
    const posted = await postComment({
      authorRoleAtPost: authorName,
      body,
      commentType: newCommentType,
      targetRecordId: selectedRecordId,
      targetRecordVersionId: selectedVersionId,
    });
    setNewCommentBody("");
    setComments(await listCommentsForVersion(selectedVersionId));
    await generateDraftForComment(posted.id, body);
  }

  /**
   * コメント本文から教材候補（title/要約/学習目標/指導のポイントと分類）を AI 生成し、
   * 「教材候補の作成」フォームへ下書きとして反映する。生成失敗は呼び出し元の操作
   * （コメント投稿・推奨）自体を妨げないよう best-effort とし、エラーはフォーム上に
   * 表示するだけに留める。反映できたかどうかを返す。
   */
  async function generateDraftFromText(sourceText: string): Promise<boolean> {
    setGenerateStatus("loading");
    setGenerateError("");
    try {
      const draft = await generateTeachingMaterialDraft(sourceText);
      setGeneratedDraft(draft);
      setCreateTitle(draft.title);
      setCreateSummary(draft.summary);
      setCreateLearningObjective(draft.learningObjective);
      setCreateTeachingPointsText(draft.teachingPoints.join("\n"));
      // 分類はマスタに実在する id のときだけ反映し、選べなかったものは現在の選択を残す。
      applyRecommendedId(
        masters.specialties,
        draft.specialtyId,
        setCreateSpecialtyId,
      );
      applyRecommendedId(
        masters.learningThemes,
        draft.learningThemeId,
        setCreateLearningThemeId,
      );
      applyRecommendedId(
        masters.difficultyLevels,
        draft.difficultyId,
        setCreateDifficultyId,
      );
      setGenerateStatus("idle");
      return true;
    } catch (caught) {
      setGenerateStatus("error");
      setGenerateError(
        caught instanceof Error ? caught.message : String(caught),
      );
      return false;
    }
  }

  /** 投稿直後のコメントを生成元にし、そのコメントを選択済みにしてフォームを開く。 */
  async function generateDraftForComment(commentId: string, body: string) {
    if (await generateDraftFromText(body)) {
      setSelectedCommentIds((prev) =>
        prev.includes(commentId) ? prev : [...prev, commentId],
      );
      setShowCreateForm(true);
    }
  }

  /** 「推奨」: 選択中のコメントをまとめて生成元にし、フォームの各欄を埋め直す。 */
  async function handleRecommend() {
    const sourceText = (comments ?? [])
      .filter((comment) => selectedCommentIds.includes(comment.id))
      .map(
        (comment) =>
          `【${commentTypeLabel(comment.commentType)}】${comment.body}`,
      )
      .join("\n\n");

    if (sourceText) {
      await generateDraftFromText(sourceText);
    }
  }

  function toggleCommentSelection(commentId: string) {
    setSelectedCommentIds((prev) =>
      prev.includes(commentId)
        ? prev.filter((id) => id !== commentId)
        : [...prev, commentId],
    );
  }

  async function handleCreateCandidate() {
    const record = (records ?? []).find((r) => r.id === selectedRecordId);
    if (
      !record ||
      selectedCommentIds.length === 0 ||
      !createTitle.trim() ||
      !createSummary.trim()
    ) {
      return;
    }
    await createCandidateFromComments({
      commentIds: selectedCommentIds,
      createdByRole: authorName,
      difficultyId: createDifficultyId,
      learningObjective: createLearningObjective.trim() || undefined,
      learningThemeId: createLearningThemeId,
      recordType: record.recordType,
      specialtyId: createSpecialtyId,
      summary: createSummary.trim(),
      teachingPoints: teachingPointsFromText(createTeachingPointsText),
      title: createTitle.trim(),
    });
    setCreateNotice(
      "教材候補を作成しました（「教材候補」タブから確認できます）。",
    );
    setShowCreateForm(false);
    setSelectedCommentIds([]);
    setCreateTitle("");
    setCreateSummary("");
    setCreateLearningObjective("");
    setCreateTeachingPointsText("");
    setGeneratedDraft(null);
  }

  function teachingPointsFromText(text: string): string[] | undefined {
    const points = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return points.length > 0 ? points : undefined;
  }

  const selectedVersion = (versions ?? []).find(
    (version) => version.id === selectedVersionId,
  );

  return (
    <section aria-label="記録から探す" className="flex flex-col gap-4">
      {recordsStatus === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            記録一覧の取得に失敗しました: {recordsError}
          </AlertDescription>
        </Alert>
      ) : null}
      {recordsStatus === "idle" && (records ?? []).length === 0 ? (
        <p className="text-muted-foreground text-std-16N-170">
          正式記録として保存された記録はまだありません。SOAP Studio
          の「正式記録として保存」から作成できます。
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {(records ?? []).map((record) => (
          <li key={record.id}>
            <Button
              type="button"
              className="w-full justify-start"
              variant={record.id === selectedRecordId ? "secondary" : "ghost"}
              aria-pressed={record.id === selectedRecordId}
              onClick={() =>
                setSelectedRecordId((prev) =>
                  prev === record.id ? null : record.id,
                )
              }
            >
              {soapRecordTypeLabel(record.recordType)} / {record.id}（
              {record.createdBy}）
            </Button>
          </li>
        ))}
      </ul>

      {versionsStatus === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            版一覧の取得に失敗しました: {versionsError}
          </AlertDescription>
        </Alert>
      ) : null}

      {versions ? (
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <Button
              type="button"
              key={version.id}
              size="sm"
              variant={
                version.id === selectedVersionId ? "secondary" : "outline"
              }
              aria-pressed={version.id === selectedVersionId}
              onClick={() => setSelectedVersionId(version.id)}
            >
              版 {version.versionNo}
            </Button>
          ))}
        </div>
      ) : null}

      {selectedVersion ? (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {selectedVersion.items.map((item) => (
              <li
                key={`${selectedVersion.id}:${item.category}:${item.text}`}
                className={cn(
                  "flex flex-col gap-1 border-l-4 bg-muted/50 px-3 py-2",
                  SOAP_CATEGORY_ACCENTS[item.category].border,
                )}
              >
                <span className="text-muted-foreground text-dns-14N-130">
                  {CATEGORY_LABELS[item.category]}
                </span>
                <p className="text-std-16N-170">{item.text}</p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <h4 className="text-std-16B-170">コメント</h4>
            <ul className="flex flex-col gap-2">
              {(comments ?? []).map((comment) => (
                <li key={comment.id} className="rounded-lg bg-muted px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-dns-14N-130">
                    {canPost ? (
                      <Checkbox
                        aria-label="教材候補作成のために選択"
                        checked={selectedCommentIds.includes(comment.id)}
                        onCheckedChange={() =>
                          toggleCommentSelection(comment.id)
                        }
                      />
                    ) : null}
                    <span>{commentTypeLabel(comment.commentType)}</span>
                    {comment.soapCategory ? (
                      <span>{CATEGORY_LABELS[comment.soapCategory]}</span>
                    ) : null}
                    <span>{comment.authorName}</span>
                  </div>
                  <p className="text-std-16N-170">{comment.body}</p>
                </li>
              ))}
            </ul>
          </div>

          {canPost ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>コメントを投稿</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field>
                  <FieldLabel htmlFor="kr-comment-type">種別</FieldLabel>
                  <OptionSelect
                    id="kr-comment-type"
                    options={COMMENT_TYPES.map((type) => ({
                      label: commentTypeLabel(type),
                      value: type,
                    }))}
                    value={newCommentType}
                    onValueChange={(value) =>
                      setNewCommentType(value as CommentType)
                    }
                  />
                </Field>
                <Textarea
                  className="min-h-32"
                  aria-label="コメント本文"
                  placeholder="思考経路を含めて自由に記述してください"
                  value={newCommentBody}
                  onChange={(event) => setNewCommentBody(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newCommentBody.trim()}
                    onClick={() => void handlePostComment()}
                  >
                    投稿
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedCommentIds.length === 0}
                    onClick={() => setShowCreateForm((prev) => !prev)}
                  >
                    選択したコメントから教材候補を作成（
                    {selectedCommentIds.length}件選択中）
                  </Button>
                </div>

                {generateStatus === "loading" ? (
                  <p className="flex items-center gap-2 text-muted-foreground text-std-16N-170">
                    <Spinner />
                    コメントから教材候補を生成しています…
                  </p>
                ) : null}
                {generateStatus === "error" ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      教材候補の生成に失敗しました: {generateError}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {createNotice ? (
                  <Alert role="status">
                    <AlertDescription>{createNotice}</AlertDescription>
                  </Alert>
                ) : null}

                {showCreateForm ? (
                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h5 className="text-std-16B-170">教材候補の作成</h5>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          generateStatus === "loading" ||
                          selectedCommentIds.length === 0
                        }
                        onClick={() => void handleRecommend()}
                      >
                        {generateStatus === "loading" ? <Spinner /> : null}
                        推奨
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-std-16N-170">
                      {generatedDraft
                        ? "AIが選択中のコメントから各項目を生成しました。内容を確認・編集してから保存してください。"
                        : "「推奨」を押すと、選択中のコメントからタイトル・要約・学習目標・指導のポイントと分野／学習テーマ／難易度をAIが下書きします。"}
                    </p>
                    <Field>
                      <FieldLabel htmlFor="kr-create-title">
                        タイトル
                      </FieldLabel>
                      <Input
                        id="kr-create-title"
                        placeholder="タイトル"
                        value={createTitle}
                        onChange={(event) => setCreateTitle(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="kr-create-summary">要約</FieldLabel>
                      <Textarea
                        className="min-h-24"
                        id="kr-create-summary"
                        placeholder="要約"
                        value={createSummary}
                        onChange={(event) =>
                          setCreateSummary(event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="kr-create-objective">
                        学習目標（learning_objective）
                      </FieldLabel>
                      <Textarea
                        className="min-h-24"
                        id="kr-create-objective"
                        placeholder="この教材候補で新人が身につけるべき学習目標"
                        value={createLearningObjective}
                        onChange={(event) =>
                          setCreateLearningObjective(event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="kr-create-points">
                        指導のポイント（teaching_points、1行1項目）
                      </FieldLabel>
                      <Textarea
                        className="min-h-24"
                        id="kr-create-points"
                        placeholder={
                          "単回の測定値だけで結論を出さない\n不足情報を明確にする"
                        }
                        value={createTeachingPointsText}
                        onChange={(event) =>
                          setCreateTeachingPointsText(event.target.value)
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-8">
                      <Field>
                        <FieldLabel htmlFor="kr-create-specialty">
                          分野
                        </FieldLabel>
                        <OptionSelect
                          id="kr-create-specialty"
                          options={toOptions(masters.specialties)}
                          value={createSpecialtyId}
                          onValueChange={setCreateSpecialtyId}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="kr-create-theme">
                          学習テーマ
                        </FieldLabel>
                        <OptionSelect
                          id="kr-create-theme"
                          options={toOptions(masters.learningThemes)}
                          value={createLearningThemeId}
                          onValueChange={setCreateLearningThemeId}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="kr-create-difficulty">
                          難易度
                        </FieldLabel>
                        <OptionSelect
                          id="kr-create-difficulty"
                          options={toOptions(masters.difficultyLevels)}
                          value={createDifficultyId}
                          onValueChange={setCreateDifficultyId}
                        />
                      </Field>
                    </div>
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!createTitle.trim() || !createSummary.trim()}
                        onClick={() => void handleCreateCandidate()}
                      >
                        作成
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <p className="text-muted-foreground text-std-16N-170">
              コメントの投稿にはこの画面を利用できるロールが必要です。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
