import { useEffect, useState } from "react";

import {
  ADMIN_DEMO_ROLES,
  type AdminDemoRole,
  addMaterial,
  addRequiredItem,
  addRubric,
  addSoapMappingVersion,
  adminDemoRoleLabel,
  canViewAdmin,
  changeMaterialStatus,
  currentVersionForRecordType,
  getTrainingDataClusterStatus,
  listMaterials,
  listQualityMetrics,
  listReferenceKnowledge,
  listRequiredItems,
  listRubrics,
  listSoapMappingVersions,
  MAPPING_CATEGORIES,
  MATERIAL_TYPES,
  type MappingDefinition,
  type Material,
  type MaterialFilters,
  type MaterialType,
  materialTypeLabel,
  PUBLICATION_STATUSES,
  type PublicationStatus,
  publicationStatusLabel,
  type QualityMetricDefinition,
  REQUIREMENT_LEVELS,
  type ReferenceKnowledge,
  type RequiredItemFilters,
  type RequiredRecommendedItem,
  type RequirementLevel,
  RUBRIC_TARGET_TYPES,
  type Rubric,
  type RubricReviewStatus,
  type RubricTargetType,
  referenceKnowledgeSourceTypeLabel,
  requirementLevelLabel,
  rubricTargetTypeLabel,
  type SoapMappingVersion,
  setRubricStatus,
  startTrainingDataCluster,
} from "../../features/admin/index.ts";
import {
  DIFFICULTY_LEVELS,
  LEARNING_THEMES,
  SPECIALTIES,
  tagLabel,
} from "../../features/knowledge-review/index.ts";
import {
  SOAP_RECORD_TYPES,
  type SoapRecordType,
  soapRecordTypeLabel,
} from "../../features/soap-draft/index.ts";
import {
  createExerciseCase,
  MODEL_ANSWER_TYPES,
  type ModelAnswerType,
  modelAnswerTypeLabel,
} from "../../features/training/index.ts";

type AdminTab =
  | "materials"
  | "rubrics"
  | "reference-knowledge"
  | "soap-mapping"
  | "required-items"
  | "quality-metrics";

const ADMIN_TABS: ReadonlyArray<{ id: AdminTab; label: string }> = [
  { id: "materials", label: "教材" },
  { id: "rubrics", label: "ルーブリック" },
  { id: "reference-knowledge", label: "参照知識" },
  { id: "soap-mapping", label: "SOAP マッピング" },
  { id: "required-items", label: "必須・推奨項目" },
  { id: "quality-metrics", label: "品質指標" },
];

export function AdminView() {
  const [role, setRole] = useState<AdminDemoRole>("admin");
  const [activeTab, setActiveTab] = useState<AdminTab>("materials");
  const canView = canViewAdmin(role);

  return (
    <>
      <h2>Admin</h2>
      <p className="workbench-main-description">
        教材・評価ルーブリック・参照知識・マスタ対応を管理する作業画面（issue
        #10）
      </p>

      <fieldset className="knowledge-review-role-select">
        <legend>ロール（デモ用の切り替え。実際の認可は未実装）</legend>
        {ADMIN_DEMO_ROLES.map((option) => (
          <label key={option} className="knowledge-review-role-option">
            <input
              type="radio"
              name="admin-role"
              checked={role === option}
              onChange={() => setRole(option)}
            />
            {adminDemoRoleLabel(option)}
          </label>
        ))}
      </fieldset>

      {!canView ? (
        <p className="knowledge-review-forbidden" role="alert">
          この画面を利用する権限がありません。ロールを「管理者」に切り替えてください。
        </p>
      ) : (
        <>
          <TrainingDataClusterPanel />

          <div className="knowledge-review-tabs" role="tablist">
            {ADMIN_TABS.map((tab) => (
              <button
                type="button"
                role="tab"
                key={tab.id}
                aria-selected={activeTab === tab.id}
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "materials" ? (
            <MaterialsTab />
          ) : activeTab === "rubrics" ? (
            <RubricsTab />
          ) : activeTab === "reference-knowledge" ? (
            <ReferenceKnowledgeTab />
          ) : activeTab === "soap-mapping" ? (
            <SoapMappingTab />
          ) : activeTab === "required-items" ? (
            <RequiredItemsTab />
          ) : (
            <QualityMetricsTab />
          )}
        </>
      )}
    </>
  );
}

/**
 * Training Data Store（Aurora Serverless v2）の cluster 状態を表示し、手動 stop された
 * cluster（scale-to-zero の自動 pause と違い Data API 呼び出しでは復帰しない）を CLI の
 * 代わりに起動できるようにする。
 */
function TrainingDataClusterPanel() {
  const [status, setStatus] = useState<string | null>(null);
  const [statusLoadState, setStatusLoadState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [startState, setStartState] = useState<"idle" | "starting" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatusLoadState("loading");
    getTrainingDataClusterStatus()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setStatus(result);
        setStatusLoadState("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setStatusLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheckStatus() {
    setStatusLoadState("loading");
    try {
      setStatus(await getTrainingDataClusterStatus());
      setStatusLoadState("idle");
    } catch {
      setStatusLoadState("error");
    }
  }

  async function handleStart() {
    setStartState("starting");
    setMessage("");
    try {
      const nextStatus = await startTrainingDataCluster();
      setStatus(nextStatus);
      setStartState("idle");
      setMessage(
        `Aurora クラスターの status: ${nextStatus}。起動には数分かかることがあるため、しばらくしてから「状態を確認」を押してください。`,
      );
    } catch (error) {
      setStartState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "クラスターの起動に失敗しました。",
      );
    }
  }

  return (
    <section
      className="admin-infra-panel"
      aria-label="Training Data Store（Aurora）の状態"
    >
      <h3>Training Data Store（Aurora）</h3>
      <p className="workbench-main-description">
        教材候補・専門職コメントなどが使う Aurora Serverless v2 cluster が手動
        stop されている場合、ここから起動できます。
      </p>
      <p>
        現在の status:{" "}
        {statusLoadState === "loading" ? "確認中…" : (status ?? "unknown")}
      </p>
      <div>
        <button type="button" onClick={() => void handleCheckStatus()}>
          状態を確認
        </button>{" "}
        <button
          type="button"
          disabled={startState === "starting"}
          onClick={() => void handleStart()}
        >
          {startState === "starting" ? "起動中…" : "Aurora クラスターを起動"}
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      {statusLoadState === "error" ? (
        <p className="soap-draft-error">
          Training Data Store の状態取得に失敗しました。
        </p>
      ) : null}
    </section>
  );
}

function MaterialsTab() {
  const [filters, setFilters] = useState<MaterialFilters>({});
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [nextStatusById, setNextStatusById] = useState<
    Record<string, PublicationStatus>
  >({});
  const [newTitle, setNewTitle] = useState("");
  const [newMaterialType, setNewMaterialType] = useState<MaterialType>(
    MATERIAL_TYPES[0],
  );
  const [newSpecialtyId, setNewSpecialtyId] = useState(
    SPECIALTIES[0]?.id ?? "",
  );
  const [newLearningThemeId, setNewLearningThemeId] = useState(
    LEARNING_THEMES[0]?.id ?? "",
  );
  const [newDifficultyId, setNewDifficultyId] = useState(
    DIFFICULTY_LEVELS[0]?.id ?? "",
  );

  useEffect(() => {
    let cancelled = false;
    listMaterials(filters).then((result) => {
      if (!cancelled) {
        setMaterials(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  async function refresh() {
    setMaterials(await listMaterials(filters));
  }

  async function handleChangeStatus(id: string) {
    const nextStatus = nextStatusById[id];
    if (!nextStatus) {
      return;
    }
    await changeMaterialStatus(id, nextStatus);
    await refresh();
  }

  async function handleAddMaterial() {
    if (!newTitle.trim()) {
      return;
    }
    await addMaterial({
      difficultyId: newDifficultyId,
      learningThemeId: newLearningThemeId,
      materialType: newMaterialType,
      specialtyId: newSpecialtyId,
      title: newTitle.trim(),
    });
    setNewTitle("");
    await refresh();
  }

  return (
    <section aria-label="教材一覧">
      <fieldset className="knowledge-review-filters">
        <legend>検索</legend>
        <label>
          教材種別
          <select
            value={filters.materialType ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                materialType: (event.target.value as MaterialType) || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {MATERIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {materialTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          公開状態
          <select
            value={filters.publicationStatus ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                publicationStatus:
                  (event.target.value as PublicationStatus) || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {PUBLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {publicationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <ul className="knowledge-review-candidate-list">
        {(materials ?? []).map((material) => (
          <li
            key={material.id}
            className="knowledge-review-candidate"
            data-status={material.publicationStatus}
          >
            <div className="knowledge-review-candidate-header">
              <h4>{material.title}</h4>
              <span
                className="knowledge-review-status-badge"
                data-status={material.publicationStatus}
              >
                {publicationStatusLabel(material.publicationStatus)}
              </span>
            </div>
            <div className="knowledge-review-tag-row">
              <span>{materialTypeLabel(material.materialType)}</span>
              <span>
                {material.specialtyId
                  ? tagLabel(SPECIALTIES, material.specialtyId)
                  : "未設定"}
              </span>
              <span>
                {material.learningThemeId
                  ? tagLabel(LEARNING_THEMES, material.learningThemeId)
                  : "未設定"}
              </span>
              <span>
                {material.difficultyId
                  ? tagLabel(DIFFICULTY_LEVELS, material.difficultyId)
                  : "未設定"}
              </span>
            </div>
            <div className="knowledge-review-decision-form">
              <label>
                変更後の公開状態
                <select
                  value={nextStatusById[material.id] ?? ""}
                  onChange={(event) =>
                    setNextStatusById((prev) => ({
                      ...prev,
                      [material.id]: event.target.value as PublicationStatus,
                    }))
                  }
                >
                  <option value="">選択してください</option>
                  {PUBLICATION_STATUSES.filter(
                    (status) => status !== material.publicationStatus,
                  ).map((status) => (
                    <option key={status} value={status}>
                      {publicationStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!nextStatusById[material.id]}
                onClick={() => void handleChangeStatus(material.id)}
              >
                変更
              </button>
            </div>
            {material.materialType === "teaching_case" ? (
              <ExerciseCaseCreateForm materialId={material.id} />
            ) : null}
          </li>
        ))}
      </ul>

      <div className="knowledge-review-create-form">
        <h5>新規教材の登録</h5>
        <input
          placeholder="タイトル"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <label>
          教材種別
          <select
            value={newMaterialType}
            onChange={(event) =>
              setNewMaterialType(event.target.value as MaterialType)
            }
          >
            {MATERIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {materialTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          分野
          <select
            value={newSpecialtyId}
            onChange={(event) => setNewSpecialtyId(event.target.value)}
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
            value={newLearningThemeId}
            onChange={(event) => setNewLearningThemeId(event.target.value)}
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
            value={newDifficultyId}
            onChange={(event) => setNewDifficultyId(event.target.value)}
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
          disabled={!newTitle.trim()}
          onClick={() => void handleAddMaterial()}
        >
          登録
        </button>
      </div>
    </section>
  );
}

type DraftFollowupQuestion = { questionText: string; revealedInfoText: string };
type DraftModelAnswer = {
  answerType: ModelAnswerType;
  content: string;
  acceptableNote: string;
};

/**
 * 既存の教材（`material_type: teaching_case`）から演習ケース（issue #9）を作るフォーム。
 * 演習ケースは教材ごとに1件だけ（`exercise_cases.material_id` が1:1）作れる。
 */
function ExerciseCaseCreateForm({ materialId }: { materialId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [initialPresentation, setInitialPresentation] = useState("");
  const [expectedWorkScene, setExpectedWorkScene] = useState("");
  const [constraintsText, setConstraintsText] = useState("");
  const [requiredInstitutionalKnowledge, setRequiredInstitutionalKnowledge] =
    useState("");
  const [followupQuestions, setFollowupQuestions] = useState<
    DraftFollowupQuestion[]
  >([]);
  const [modelAnswers, setModelAnswers] = useState<DraftModelAnswer[]>([]);
  const [selectedRubricIds, setSelectedRubricIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!expanded || rubrics) {
      return;
    }
    let cancelled = false;
    listRubrics().then((result) => {
      if (!cancelled) {
        setRubrics(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, rubrics]);

  function updateFollowupQuestion(
    index: number,
    field: keyof DraftFollowupQuestion,
    value: string,
  ) {
    setFollowupQuestions((prev) =>
      prev.map((question, i) =>
        i === index ? { ...question, [field]: value } : question,
      ),
    );
  }

  function updateModelAnswer(
    index: number,
    field: keyof DraftModelAnswer,
    value: string,
  ) {
    setModelAnswers((prev) =>
      prev.map((answer, i) =>
        i === index ? { ...answer, [field]: value } : answer,
      ),
    );
  }

  function toggleRubric(rubricId: string) {
    setSelectedRubricIds((prev) =>
      prev.includes(rubricId)
        ? prev.filter((id) => id !== rubricId)
        : [...prev, rubricId],
    );
  }

  function resetForm() {
    setInitialPresentation("");
    setExpectedWorkScene("");
    setConstraintsText("");
    setRequiredInstitutionalKnowledge("");
    setFollowupQuestions([]);
    setModelAnswers([]);
    setSelectedRubricIds([]);
  }

  async function handleSubmit() {
    setStatus("saving");
    setError("");
    try {
      await createExerciseCase({
        constraintsText: constraintsText.trim() || undefined,
        expectedWorkScene: expectedWorkScene.trim() || undefined,
        followupQuestions: followupQuestions
          .filter((q) => q.questionText.trim() && q.revealedInfoText.trim())
          .map((q) => ({
            questionText: q.questionText.trim(),
            revealedInfoText: q.revealedInfoText.trim(),
          })),
        initialPresentation: initialPresentation.trim(),
        materialId,
        modelAnswers: modelAnswers
          .filter((a) => a.content.trim())
          .map((a) => ({
            acceptableNote: a.acceptableNote.trim() || undefined,
            answerType: a.answerType,
            content: a.content.trim(),
          })),
        requiredInstitutionalKnowledge:
          requiredInstitutionalKnowledge.trim() || undefined,
        rubricIds: selectedRubricIds,
      });
      setStatus("done");
      resetForm();
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)}>
        演習ケースを作成
      </button>
    );
  }

  return (
    <div className="knowledge-review-create-form">
      <h5>演習ケースの作成</h5>
      <label>
        初期提示情報
        <textarea
          value={initialPresentation}
          onChange={(event) => setInitialPresentation(event.target.value)}
        />
      </label>
      <label>
        想定業務場面
        <input
          value={expectedWorkScene}
          onChange={(event) => setExpectedWorkScene(event.target.value)}
        />
      </label>
      <label>
        制約条件
        <textarea
          value={constraintsText}
          onChange={(event) => setConstraintsText(event.target.value)}
        />
      </label>
      <label>
        必要な制度知識
        <input
          value={requiredInstitutionalKnowledge}
          onChange={(event) =>
            setRequiredInstitutionalKnowledge(event.target.value)
          }
        />
      </label>

      <fieldset>
        <legend>追加質問</legend>
        {followupQuestions.map((question, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 並べ替え無しの追加専用リストのため index で十分。
          <div key={index}>
            <input
              placeholder="設問文"
              value={question.questionText}
              onChange={(event) =>
                updateFollowupQuestion(
                  index,
                  "questionText",
                  event.target.value,
                )
              }
            />
            <input
              placeholder="開示される追加情報"
              value={question.revealedInfoText}
              onChange={(event) =>
                updateFollowupQuestion(
                  index,
                  "revealedInfoText",
                  event.target.value,
                )
              }
            />
            <button
              type="button"
              onClick={() =>
                setFollowupQuestions((prev) =>
                  prev.filter((_, i) => i !== index),
                )
              }
            >
              削除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setFollowupQuestions((prev) => [
              ...prev,
              { questionText: "", revealedInfoText: "" },
            ])
          }
        >
          追加質問を追加
        </button>
      </fieldset>

      <fieldset>
        <legend>模範回答</legend>
        {modelAnswers.map((answer, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 並べ替え無しの追加専用リストのため index で十分。
          <div key={index}>
            <select
              value={answer.answerType}
              onChange={(event) =>
                updateModelAnswer(index, "answerType", event.target.value)
              }
            >
              {MODEL_ANSWER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {modelAnswerTypeLabel(type)}
                </option>
              ))}
            </select>
            <textarea
              placeholder="回答内容"
              value={answer.content}
              onChange={(event) =>
                updateModelAnswer(index, "content", event.target.value)
              }
            />
            <input
              placeholder="許容される理由（任意）"
              value={answer.acceptableNote}
              onChange={(event) =>
                updateModelAnswer(index, "acceptableNote", event.target.value)
              }
            />
            <button
              type="button"
              onClick={() =>
                setModelAnswers((prev) => prev.filter((_, i) => i !== index))
              }
            >
              削除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setModelAnswers((prev) => [
              ...prev,
              {
                acceptableNote: "",
                answerType: MODEL_ANSWER_TYPES[0],
                content: "",
              },
            ])
          }
        >
          模範回答を追加
        </button>
      </fieldset>

      <fieldset>
        <legend>評価観点として使うルーブリック</legend>
        {(rubrics ?? []).map((rubric) => (
          <label key={rubric.id}>
            <input
              type="checkbox"
              checked={selectedRubricIds.includes(rubric.id)}
              onChange={() => toggleRubric(rubric.id)}
            />
            {rubric.name}
          </label>
        ))}
      </fieldset>

      {status === "done" ? <p>演習ケースを作成しました。</p> : null}
      {status === "error" ? <p className="soap-draft-error">{error}</p> : null}

      <button type="button" onClick={() => setExpanded(false)}>
        閉じる
      </button>
      <button
        type="button"
        disabled={!initialPresentation.trim() || status === "saving"}
        onClick={() => void handleSubmit()}
      >
        {status === "saving" ? "作成中…" : "作成"}
      </button>
    </div>
  );
}

function RubricsTab() {
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newTargetType, setNewTargetType] = useState<RubricTargetType>(
    RUBRIC_TARGET_TYPES[0],
  );

  useEffect(() => {
    let cancelled = false;
    listRubrics().then((result) => {
      if (!cancelled) {
        setRubrics(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleStatus(rubric: Rubric) {
    const next: RubricReviewStatus =
      rubric.reviewStatus === "confirmed"
        ? "expert_review_required"
        : "confirmed";
    await setRubricStatus(rubric.id, next);
    setRubrics(await listRubrics());
  }

  async function handleAddRubric() {
    if (!newName.trim()) {
      return;
    }
    await addRubric({
      name: newName.trim(),
      targetType: newTargetType,
    });
    setNewName("");
    setRubrics(await listRubrics());
  }

  return (
    <section aria-label="ルーブリック一覧">
      <ul className="knowledge-review-candidate-list">
        {(rubrics ?? []).map((rubric) => (
          <li
            key={rubric.id}
            className="knowledge-review-candidate"
            data-status={rubric.reviewStatus}
          >
            <div className="knowledge-review-candidate-header">
              <h4>{rubric.name}</h4>
              <span
                className="knowledge-review-status-badge"
                data-status={rubric.reviewStatus}
              >
                {rubric.reviewStatus === "confirmed"
                  ? "確認済み"
                  : "有識者確認前"}
              </span>
            </div>
            <div className="knowledge-review-tag-row">
              <span>{rubricTargetTypeLabel(rubric.targetType)}</span>
              <span>version {rubric.versionNo}</span>
            </div>
            {rubric.items.length > 0 ? (
              <ul className="knowledge-review-comment-list">
                {rubric.items.map((item) => (
                  <li key={item.id} className="knowledge-review-comment">
                    <div className="knowledge-review-comment-header">
                      <span>{item.criterionName}</span>
                    </div>
                    <p className="soap-draft-text">{item.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="workbench-main-description">
                評価項目は未登録です。
              </p>
            )}
            <div className="soap-draft-candidate-actions">
              <button type="button" onClick={() => void toggleStatus(rubric)}>
                {rubric.reviewStatus === "confirmed"
                  ? "未確認に戻す"
                  : "確認済みにする"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="knowledge-review-create-form">
        <h5>新規ルーブリックの登録</h5>
        <input
          placeholder="ルーブリック名"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <label>
          対象
          <select
            value={newTargetType}
            onChange={(event) =>
              setNewTargetType(
                event.target.value as (typeof RUBRIC_TARGET_TYPES)[number],
              )
            }
          >
            {RUBRIC_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {rubricTargetTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => void handleAddRubric()}
        >
          登録
        </button>
      </div>
    </section>
  );
}

function ReferenceKnowledgeTab() {
  const [items, setItems] = useState<ReferenceKnowledge[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listReferenceKnowledge(),
      listMaterials(),
      listRubrics(),
    ]).then(([referenceKnowledge, materialList, rubricList]) => {
      if (cancelled) {
        return;
      }
      setItems(referenceKnowledge);
      setMaterials(materialList);
      setRubrics(rubricList);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function materialTitle(id: string): string {
    return materials.find((material) => material.id === id)?.title ?? id;
  }

  function rubricName(id: string): string {
    return rubrics.find((rubric) => rubric.id === id)?.name ?? id;
  }

  return (
    <section aria-label="参照知識一覧">
      <ul className="knowledge-review-comment-list">
        {(items ?? []).map((item) => (
          <li key={item.id} className="knowledge-review-comment">
            <div className="knowledge-review-comment-header">
              <span>{item.title}</span>
              <span>{referenceKnowledgeSourceTypeLabel(item.sourceType)}</span>
            </div>
            <p className="soap-draft-text">{item.summary}</p>
            {item.externalKbRef ? (
              <p className="workbench-main-description">
                参照元: {item.externalKbRef}
              </p>
            ) : null}
            <div className="knowledge-review-tag-row">
              {item.linkedMaterialIds.length === 0 &&
              item.linkedRubricIds.length === 0 ? (
                <span>紐づく教材・ルーブリックはありません</span>
              ) : (
                <>
                  {item.linkedMaterialIds.map((materialId) => (
                    <span key={materialId}>
                      教材: {materialTitle(materialId)}
                    </span>
                  ))}
                  {item.linkedRubricIds.map((rubricId) => (
                    <span key={rubricId}>
                      ルーブリック: {rubricName(rubricId)}
                    </span>
                  ))}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SoapMappingTab() {
  const [recordType, setRecordType] = useState<SoapRecordType>(
    SOAP_RECORD_TYPES[0],
  );
  const [versions, setVersions] = useState<SoapMappingVersion[] | null>(null);
  const [draft, setDraft] = useState<MappingDefinition>({
    A: "",
    O: "",
    P: "",
    S: "",
  });
  const [confirmedNoRetroactive, setConfirmedNoRetroactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSoapMappingVersions(recordType).then((result) => {
      if (cancelled) {
        return;
      }
      setVersions(result);
      const current = currentVersionForRecordType(result, recordType);
      setDraft(current?.mappingDefinition ?? { A: "", O: "", P: "", S: "" });
      setConfirmedNoRetroactive(false);
    });
    return () => {
      cancelled = true;
    };
  }, [recordType]);

  const canSave =
    confirmedNoRetroactive &&
    MAPPING_CATEGORIES.every((category) => draft[category].trim());

  async function handleSave() {
    if (!canSave) {
      return;
    }
    const updated = await addSoapMappingVersion(recordType, draft);
    setVersions(updated);
    setConfirmedNoRetroactive(false);
  }

  return (
    <section aria-label="SOAP マッピング">
      <div className="knowledge-review-tabs" role="tablist">
        {SOAP_RECORD_TYPES.map((type) => (
          <button
            type="button"
            key={type}
            data-active={type === recordType}
            onClick={() => setRecordType(type)}
          >
            {soapRecordTypeLabel(type)}
          </button>
        ))}
      </div>

      <h4>バージョン履歴</h4>
      <ul className="knowledge-review-status-history">
        {(versions ?? []).map((version) => (
          <li key={version.id}>
            version {version.versionNo}
            {version.isCurrent ? "（現在有効）" : ""} — {version.createdBy} —{" "}
            {version.effectiveFrom}
          </li>
        ))}
      </ul>

      <div className="knowledge-review-create-form">
        <h5>新規バージョンの作成</h5>
        {MAPPING_CATEGORIES.map((category) => (
          <label key={category}>
            {category}
            <textarea
              value={draft[category]}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  [category]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <label className="knowledge-review-role-option">
          <input
            type="checkbox"
            checked={confirmedNoRetroactive}
            onChange={(event) =>
              setConfirmedNoRetroactive(event.target.checked)
            }
          />
          既存記録には遡って適用されないことを確認しました
        </label>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          新規バージョンとして保存
        </button>
      </div>
    </section>
  );
}

function RequiredItemsTab() {
  const [filters, setFilters] = useState<RequiredItemFilters>({});
  const [items, setItems] = useState<RequiredRecommendedItem[] | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newRecordType, setNewRecordType] = useState<SoapRecordType>(
    SOAP_RECORD_TYPES[0],
  );
  const [newSpecialtyId, setNewSpecialtyId] = useState("");
  const [newRequirementLevel, setNewRequirementLevel] =
    useState<RequirementLevel>(REQUIREMENT_LEVELS[0]);
  const [newAggregationCategory, setNewAggregationCategory] = useState("");

  useEffect(() => {
    let cancelled = false;
    listRequiredItems(filters).then((result) => {
      if (!cancelled) {
        setItems(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  async function refresh() {
    setItems(await listRequiredItems(filters));
  }

  async function handleAdd() {
    if (!newItemName.trim() || !newAggregationCategory.trim()) {
      return;
    }
    await addRequiredItem({
      aggregationCategory: newAggregationCategory.trim(),
      itemName: newItemName.trim(),
      recordType: newRecordType,
      requirementLevel: newRequirementLevel,
      specialtyId: newSpecialtyId || undefined,
    });
    setNewItemName("");
    setNewAggregationCategory("");
    await refresh();
  }

  return (
    <section aria-label="必須・推奨項目">
      <fieldset className="knowledge-review-filters">
        <legend>検索</legend>
        <label>
          記録種別
          <select
            value={filters.recordType ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                recordType: (event.target.value as SoapRecordType) || undefined,
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
      </fieldset>

      <ul className="knowledge-review-status-history">
        {(items ?? []).map((item) => (
          <li key={item.id}>
            <span className="knowledge-review-status-badge">
              {requirementLevelLabel(item.requirementLevel)}
            </span>{" "}
            {item.itemName}（{soapRecordTypeLabel(item.recordType)} /{" "}
            {item.specialtyId
              ? tagLabel(SPECIALTIES, item.specialtyId)
              : "全分野"}{" "}
            / {item.aggregationCategory}）
          </li>
        ))}
      </ul>

      <div className="knowledge-review-create-form">
        <h5>新規項目の登録</h5>
        <input
          placeholder="項目名"
          value={newItemName}
          onChange={(event) => setNewItemName(event.target.value)}
        />
        <label>
          記録種別
          <select
            value={newRecordType}
            onChange={(event) =>
              setNewRecordType(event.target.value as SoapRecordType)
            }
          >
            {SOAP_RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {soapRecordTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          分野（任意）
          <select
            value={newSpecialtyId}
            onChange={(event) => setNewSpecialtyId(event.target.value)}
          >
            <option value="">全分野</option>
            {SPECIALTIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          必須/推奨
          <select
            value={newRequirementLevel}
            onChange={(event) =>
              setNewRequirementLevel(
                event.target.value as (typeof REQUIREMENT_LEVELS)[number],
              )
            }
          >
            {REQUIREMENT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {requirementLevelLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="集計分類"
          value={newAggregationCategory}
          onChange={(event) => setNewAggregationCategory(event.target.value)}
        />
        <button
          type="button"
          disabled={!newItemName.trim() || !newAggregationCategory.trim()}
          onClick={() => void handleAdd()}
        >
          登録
        </button>
      </div>
    </section>
  );
}

function QualityMetricsTab() {
  const [metrics, setMetrics] = useState<QualityMetricDefinition[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    listQualityMetrics().then((result) => {
      if (!cancelled) {
        setMetrics(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="品質指標">
      <p className="workbench-main-description">
        指標の目標値・合格ラインの設定は issue #10 の Out of Scope
        のため、ここでは定義のみを表示する。
      </p>
      <ul className="knowledge-review-comment-list">
        {(metrics ?? []).map((metric) => (
          <li key={metric.metricKey} className="knowledge-review-comment">
            <div className="knowledge-review-comment-header">
              <span>{metric.displayName}</span>
              <span>{metric.metricKey}</span>
            </div>
            <p className="soap-draft-text">{metric.calculationDescription}</p>
            <p className="workbench-main-description">
              集計対象: {metric.targetEntity}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
