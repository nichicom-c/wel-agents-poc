import { useEffect, useState } from "react";

import {
  COMMENT_TYPES,
  type CommentType,
  canDecideCandidateStatus,
  canPostComment,
  canViewKnowledgeReview,
  commentTypeLabel,
  createCandidateFromComments,
  DIFFICULTY_LEVELS,
  decideCandidateStatus,
  KNOWLEDGE_REVIEW_ROLES,
  type KnowledgeReviewRole,
  knowledgeReviewRoleLabel,
  LEARNING_THEMES,
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
  REJECTION_REASON_CODES,
  type RejectionReasonCode,
  rejectionReasonLabel,
  type SoapRecordSummary,
  type SoapRecordVersion,
  SPECIALTIES,
  tagLabel,
} from "../../features/knowledge-review/index.ts";
import {
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

export function KnowledgeReviewView() {
  const [role, setRole] = useState<KnowledgeReviewRole>("nurse");
  const [activeTab, setActiveTab] = useState<KnowledgeReviewTab>("candidates");
  const canView = canViewKnowledgeReview(role);
  const canPost = canPostComment(role);
  const canDecide = canDecideCandidateStatus(role);
  const authorName = DEMO_ROLE_LABELS[role];

  return (
    <>
      <h2>Knowledge Review</h2>
      <p className="workbench-main-description">
        専門職コメントからノウハウと教材候補を蓄積する作業画面（issue #8）
      </p>

      <fieldset className="knowledge-review-role-select">
        <legend>ロール（デモ用の切り替え。実際の認可は未実装）</legend>
        {KNOWLEDGE_REVIEW_ROLES.map((option) => (
          <label key={option} className="knowledge-review-role-option">
            <input
              type="radio"
              name="knowledge-review-role"
              checked={role === option}
              onChange={() => setRole(option)}
            />
            {knowledgeReviewRoleLabel(option)}
          </label>
        ))}
      </fieldset>

      {!canView ? (
        <p className="knowledge-review-forbidden" role="alert">
          この画面を利用する権限がありません。ロールを「専門職」「レビュー承認者」「管理者」に切り替えてください。
        </p>
      ) : (
        <>
          <div className="knowledge-review-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "candidates"}
              data-active={activeTab === "candidates"}
              onClick={() => setActiveTab("candidates")}
            >
              教材候補
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "records"}
              data-active={activeTab === "records"}
              onClick={() => setActiveTab("records")}
            >
              記録から探す
            </button>
          </div>

          {activeTab === "candidates" ? (
            <CandidateTab authorName={authorName} canDecide={canDecide} />
          ) : (
            <RecordTab authorName={authorName} canPost={canPost} />
          )}
        </>
      )}
    </>
  );
}

type CandidateTabProps = {
  authorName: string;
  canDecide: boolean;
};

function CandidateTab({ authorName, canDecide }: CandidateTabProps) {
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
    <section className="knowledge-review-candidates" aria-label="教材候補一覧">
      <fieldset className="knowledge-review-filters">
        <legend>検索</legend>
        <label>
          分野
          <select
            value={filters.specialtyId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                specialtyId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {SPECIALTIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          記録種別
          <select
            value={filters.recordType ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                recordType:
                  (event.target
                    .value as MaterialCandidateFilters["recordType"]) ||
                  undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {SOAP_RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {soapRecordTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          学習テーマ
          <select
            value={filters.learningThemeId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                learningThemeId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {LEARNING_THEMES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          難易度
          <select
            value={filters.difficultyId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                difficultyId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {DIFFICULTY_LEVELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          状態
          <select
            value={filters.status ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                status:
                  (event.target.value as MaterialCandidateFilters["status"]) ||
                  undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {MATERIAL_CANDIDATE_STATUSES.map((option) => (
              <option key={option} value={option}>
                {materialCandidateStatusLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {status === "error" ? (
        <p className="soap-draft-error">
          教材候補の取得に失敗しました: {loadError}
        </p>
      ) : null}

      {candidates ? (
        <p className="workbench-main-description">{candidates.length}件</p>
      ) : null}

      <ul className="knowledge-review-candidate-list">
        {(candidates ?? []).map((candidate) => (
          <li
            key={candidate.id}
            className="knowledge-review-candidate"
            data-status={candidate.status}
          >
            <div className="knowledge-review-candidate-header">
              <h4>{candidate.title}</h4>
              <span
                className="knowledge-review-status-badge"
                data-status={candidate.status}
              >
                {materialCandidateStatusLabel(candidate.status)}
              </span>
            </div>
            <p className="soap-draft-text">{candidate.summary}</p>
            <div className="knowledge-review-tag-row">
              <span>
                {candidate.specialtyId
                  ? tagLabel(SPECIALTIES, candidate.specialtyId)
                  : "未設定"}
              </span>
              <span>
                {candidate.recordType
                  ? soapRecordTypeLabel(candidate.recordType)
                  : "未設定"}
              </span>
              <span>
                {candidate.learningThemeId
                  ? tagLabel(LEARNING_THEMES, candidate.learningThemeId)
                  : "未設定"}
              </span>
              <span>
                {candidate.difficultyId
                  ? tagLabel(DIFFICULTY_LEVELS, candidate.difficultyId)
                  : "未設定"}
              </span>
            </div>
            <div className="soap-draft-candidate-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setSelectedId((prev) =>
                    prev === candidate.id ? null : candidate.id,
                  )
                }
              >
                {selectedId === candidate.id ? "閉じる" : "詳細"}
              </button>
            </div>

            {selectedId === candidate.id ? (
              <div className="knowledge-review-candidate-detail">
                <h5>紐づく専門職コメント</h5>
                {candidate.comments.length === 0 ? (
                  <p className="workbench-main-description">
                    紐づくコメントはありません。
                  </p>
                ) : (
                  <ul className="knowledge-review-comment-list">
                    {candidate.comments.map((comment) => (
                      <li key={comment.id} className="knowledge-review-comment">
                        <div className="knowledge-review-comment-header">
                          <span>{commentTypeLabel(comment.commentType)}</span>
                          <span>{comment.authorName}</span>
                        </div>
                        <p className="soap-draft-text">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                <h5>状態の履歴</h5>
                <ul className="knowledge-review-status-history">
                  {candidate.statusHistory.map((event) => (
                    <li key={`${event.toStatus}:${event.changedAt}`}>
                      {materialCandidateStatusLabel(event.toStatus)} —{" "}
                      {event.changedByRole}
                      {event.reasonText ? `（${event.reasonText}）` : ""}
                    </li>
                  ))}
                </ul>

                {candidate.rejectionReasonCode ? (
                  <p className="workbench-main-description">
                    却下理由:{" "}
                    {rejectionReasonLabel(candidate.rejectionReasonCode)}
                  </p>
                ) : null}

                {candidate.status === "approved" ? (
                  <div className="knowledge-review-decision-form">
                    <h5>教材化</h5>
                    {candidate.materialId ? (
                      <p className="workbench-main-description">
                        教材化済み（教材ID: {candidate.materialId}）。Admin の
                        「教材」タブから確認できます。
                      </p>
                    ) : canDecide ? (
                      <>
                        <p className="workbench-main-description">
                          issue #10 の教材（status: draft）として登録します。
                        </p>
                        <button
                          type="button"
                          onClick={() => void handlePromote(candidate.id)}
                        >
                          教材にする
                        </button>
                        {promoteError ? (
                          <p className="soap-draft-error">{promoteError}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="workbench-main-description">
                        教材化にはレビュー承認者または管理者の権限が必要です。
                      </p>
                    )}
                  </div>
                ) : null}

                {canDecide ? (
                  <div className="knowledge-review-decision-form">
                    <h5>状態を変更</h5>
                    <label>
                      却下理由（却下する場合は必須）
                      <select
                        value={reasonCode}
                        onChange={(event) =>
                          setReasonCode(
                            event.target.value as RejectionReasonCode | "",
                          )
                        }
                      >
                        <option value="">選択してください</option>
                        {REJECTION_REASON_CODES.map((code) => (
                          <option key={code} value={code}>
                            {rejectionReasonLabel(code)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      placeholder="補足コメント（要修正の場合はここに修正依頼を書く）"
                      value={reasonText}
                      onChange={(event) => setReasonText(event.target.value)}
                    />
                    <div className="soap-draft-candidate-actions">
                      <button
                        type="button"
                        onClick={() =>
                          void handleDecide(candidate.id, "approved")
                        }
                      >
                        承認
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!reasonCode}
                        onClick={() =>
                          void handleDecide(candidate.id, "rejected")
                        }
                      >
                        却下
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!reasonText.trim()}
                        onClick={() =>
                          void handleDecide(candidate.id, "needs_revision")
                        }
                      >
                        要修正
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="workbench-main-description">
                    状態の変更にはレビュー承認者または管理者の権限が必要です。
                  </p>
                )}
              </div>
            ) : null}
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
  const [createSpecialtyId, setCreateSpecialtyId] = useState(
    SPECIALTIES[0]?.id ?? "",
  );
  const [createLearningThemeId, setCreateLearningThemeId] = useState(
    LEARNING_THEMES[0]?.id ?? "",
  );
  const [createDifficultyId, setCreateDifficultyId] = useState(
    DIFFICULTY_LEVELS[0]?.id ?? "",
  );
  const [createNotice, setCreateNotice] = useState("");

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
    await postComment({
      authorRoleAtPost: authorName,
      body: newCommentBody.trim(),
      commentType: newCommentType,
      targetRecordId: selectedRecordId,
      targetRecordVersionId: selectedVersionId,
    });
    setNewCommentBody("");
    setComments(await listCommentsForVersion(selectedVersionId));
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
      learningThemeId: createLearningThemeId,
      recordType: record.recordType,
      specialtyId: createSpecialtyId,
      summary: createSummary.trim(),
      title: createTitle.trim(),
    });
    setCreateNotice(
      "教材候補を作成しました（「教材候補」タブから確認できます）。",
    );
    setShowCreateForm(false);
    setSelectedCommentIds([]);
    setCreateTitle("");
    setCreateSummary("");
  }

  const selectedVersion = (versions ?? []).find(
    (version) => version.id === selectedVersionId,
  );

  return (
    <section className="knowledge-review-records" aria-label="記録から探す">
      {recordsStatus === "error" ? (
        <p className="soap-draft-error">
          記録一覧の取得に失敗しました: {recordsError}
        </p>
      ) : null}
      {recordsStatus === "idle" && (records ?? []).length === 0 ? (
        <p className="workbench-main-description">
          正式記録として保存された記録はまだありません。SOAP Studio
          の「正式記録として保存」から作成できます。
        </p>
      ) : null}
      <ul className="knowledge-review-record-list">
        {(records ?? []).map((record) => (
          <li key={record.id}>
            <button
              type="button"
              className="secondary-button"
              data-active={record.id === selectedRecordId}
              onClick={() =>
                setSelectedRecordId((prev) =>
                  prev === record.id ? null : record.id,
                )
              }
            >
              {soapRecordTypeLabel(record.recordType)} / {record.id}（
              {record.createdBy}）
            </button>
          </li>
        ))}
      </ul>

      {versionsStatus === "error" ? (
        <p className="soap-draft-error">
          版一覧の取得に失敗しました: {versionsError}
        </p>
      ) : null}

      {versions ? (
        <div className="knowledge-review-version-tabs">
          {versions.map((version) => (
            <button
              type="button"
              key={version.id}
              className="secondary-button"
              data-active={version.id === selectedVersionId}
              onClick={() => setSelectedVersionId(version.id)}
            >
              版 {version.versionNo}
            </button>
          ))}
        </div>
      ) : null}

      {selectedVersion ? (
        <div className="knowledge-review-record-version">
          <ul className="soap-draft-candidate-list">
            {selectedVersion.items.map((item) => (
              <li
                key={`${selectedVersion.id}:${item.category}:${item.text}`}
                className="soap-draft-candidate"
                data-category={item.category}
              >
                <span className="soap-candidate-status">
                  {CATEGORY_LABELS[item.category]}
                </span>
                <p className="soap-draft-text">{item.text}</p>
              </li>
            ))}
          </ul>

          <h4>コメント</h4>
          <ul className="knowledge-review-comment-list">
            {(comments ?? []).map((comment) => (
              <li key={comment.id} className="knowledge-review-comment">
                <div className="knowledge-review-comment-header">
                  {canPost ? (
                    <input
                      type="checkbox"
                      aria-label="教材候補作成のために選択"
                      checked={selectedCommentIds.includes(comment.id)}
                      onChange={() => toggleCommentSelection(comment.id)}
                    />
                  ) : null}
                  <span>{commentTypeLabel(comment.commentType)}</span>
                  {comment.soapCategory ? (
                    <span>{CATEGORY_LABELS[comment.soapCategory]}</span>
                  ) : null}
                  <span>{comment.authorName}</span>
                </div>
                <p className="soap-draft-text">{comment.body}</p>
              </li>
            ))}
          </ul>

          {canPost ? (
            <div className="knowledge-review-comment-form">
              <h4>コメントを投稿</h4>
              <label>
                種別
                <select
                  value={newCommentType}
                  onChange={(event) =>
                    setNewCommentType(event.target.value as CommentType)
                  }
                >
                  {COMMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {commentTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                placeholder="思考経路を含めて自由に記述してください"
                value={newCommentBody}
                onChange={(event) => setNewCommentBody(event.target.value)}
              />
              <button
                type="button"
                disabled={!newCommentBody.trim()}
                onClick={() => void handlePostComment()}
              >
                投稿
              </button>

              <div className="soap-draft-candidate-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={selectedCommentIds.length === 0}
                  onClick={() => setShowCreateForm((prev) => !prev)}
                >
                  選択したコメントから教材候補を作成（
                  {selectedCommentIds.length}件選択中）
                </button>
              </div>

              {createNotice ? (
                <p className="workbench-main-description">{createNotice}</p>
              ) : null}

              {showCreateForm ? (
                <div className="knowledge-review-create-form">
                  <h5>教材候補の作成</h5>
                  <input
                    placeholder="タイトル"
                    value={createTitle}
                    onChange={(event) => setCreateTitle(event.target.value)}
                  />
                  <textarea
                    placeholder="要約"
                    value={createSummary}
                    onChange={(event) => setCreateSummary(event.target.value)}
                  />
                  <label>
                    分野
                    <select
                      value={createSpecialtyId}
                      onChange={(event) =>
                        setCreateSpecialtyId(event.target.value)
                      }
                    >
                      {SPECIALTIES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    学習テーマ
                    <select
                      value={createLearningThemeId}
                      onChange={(event) =>
                        setCreateLearningThemeId(event.target.value)
                      }
                    >
                      {LEARNING_THEMES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    難易度
                    <select
                      value={createDifficultyId}
                      onChange={(event) =>
                        setCreateDifficultyId(event.target.value)
                      }
                    >
                      {DIFFICULTY_LEVELS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!createTitle.trim() || !createSummary.trim()}
                    onClick={() => void handleCreateCandidate()}
                  >
                    作成
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="workbench-main-description">
              コメントの投稿にはこの画面を利用できるロールが必要です。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
