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
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  ADMIN_DEMO_ROLES,
  type AdminDemoRole,
  addMaterial,
  addPromptTemplate,
  addRubric,
  addSoapKnowledgeBase,
  addSoapKnowledgeItem,
  adminDemoRoleLabel,
  canViewAdmin,
  changeMaterialStatus,
  getTrainingDataClusterStatus,
  KNOWLEDGE_BASE_STATUSES,
  KNOWLEDGE_ITEM_CATEGORIES,
  type KnowledgeBaseStatus,
  type KnowledgeItemCategory,
  knowledgeBaseStatusLabel,
  knowledgeItemCategoryLabel,
  listMaterials,
  listPromptTemplates,
  listRubrics,
  listSoapKnowledgeBases,
  listSoapKnowledgeItems,
  MATERIAL_TYPES,
  type Material,
  type MaterialFilters,
  type MaterialType,
  materialTypeLabel,
  type PromptTemplate,
  PUBLICATION_STATUSES,
  type PublicationStatus,
  publicationStatusLabel,
  RUBRIC_LEVEL_NUMBERS,
  type Rubric,
  type RubricLevelNumber,
  type SoapKnowledgeBase,
  type SoapKnowledgeItem,
  setRubricActive,
  setSoapKnowledgeBaseStatus,
  setSoapKnowledgeItemActive,
  startTrainingDataCluster,
} from "../../features/admin/index.ts";
import { tagLabel, useMasters } from "../../features/masters/index.ts";

type AdminTab = "materials" | "knowledge-base" | "rubrics" | "prompt-templates";

const ADMIN_TABS: ReadonlyArray<{ id: AdminTab; label: string }> = [
  { id: "materials", label: "教材" },
  { id: "knowledge-base", label: "Knowledge Base" },
  { id: "rubrics", label: "ルーブリック" },
  { id: "prompt-templates", label: "Prompt Template" },
];

const PUBLICATION_BADGE_VARIANTS: Record<
  PublicationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  archived: "destructive",
  draft: "secondary",
  published: "default",
  reviewing: "outline",
};

const KNOWLEDGE_BASE_BADGE_VARIANTS: Record<
  KnowledgeBaseStatus,
  "default" | "secondary" | "destructive"
> = {
  active: "default",
  archived: "destructive",
  draft: "secondary",
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

export function AdminView() {
  const [role, setRole] = useState<AdminDemoRole>("admin");
  const [activeTab, setActiveTab] = useState<AdminTab>("materials");
  const canView = canViewAdmin(role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-std-24B-150">Admin</h2>
        <p className="text-muted-foreground text-std-16N-170">
          教材・Knowledge Base・評価ルーブリック・Prompt
          Template・マスタ対応を管理する作業画面
        </p>
      </div>

      <DemoRoleSwitcher
        idPrefix="admin-role"
        label={adminDemoRoleLabel}
        roles={ADMIN_DEMO_ROLES}
        value={role}
        onValueChange={setRole}
      />

      {!canView ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            この画面を利用する権限がありません。ロールを「管理者」に切り替えてください。
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <TrainingDataClusterPanel />

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as AdminTab)}
          >
            <TabsList variant="line">
              {ADMIN_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex-none px-3"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="materials">
              <MaterialsTab />
            </TabsContent>
            <TabsContent value="knowledge-base">
              <KnowledgeBaseTab />
            </TabsContent>
            <TabsContent value="rubrics">
              <RubricsTab />
            </TabsContent>
            <TabsContent value="prompt-templates">
              <PromptTemplatesTab />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
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
    <section aria-label="Training Data Store（Aurora）の状態">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Training Data Store（Aurora）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-muted-foreground text-std-16N-170">
            教材候補・専門職コメントなどが使う Aurora Serverless v2 cluster
            が手動 stop されている場合、ここから起動できます。
          </p>
          <p className="text-std-16N-170">
            現在の status:{" "}
            {statusLoadState === "loading" ? "確認中…" : (status ?? "unknown")}
          </p>
          {message ? (
            <Alert role="status">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {statusLoadState === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>
                Training Data Store の状態取得に失敗しました。
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleCheckStatus()}
          >
            状態を確認
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={startState === "starting"}
            onClick={() => void handleStart()}
          >
            {startState === "starting" ? "起動中…" : "Aurora クラスターを起動"}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

function MaterialsTab() {
  const masters = useMasters();
  const [filters, setFilters] = useState<MaterialFilters>({});
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [nextStatusById, setNextStatusById] = useState<
    Record<string, PublicationStatus>
  >({});
  const [newTitle, setNewTitle] = useState("");
  const [newMaterialType, setNewMaterialType] = useState<MaterialType>(
    MATERIAL_TYPES[0],
  );
  const [newSpecialtyId, setNewSpecialtyId] = useState("");
  const [newLearningThemeId, setNewLearningThemeId] = useState("");
  const [newDifficultyId, setNewDifficultyId] = useState("");
  const [newLearningObjective, setNewLearningObjective] = useState("");
  const [newTeachingPointsText, setNewTeachingPointsText] = useState("");

  // マスタは非同期で届くため、未選択のものだけ先頭を既定値にする（利用者の選択は上書きしない）。
  useEffect(() => {
    setNewSpecialtyId((current) => current || masters.specialties[0]?.id || "");
    setNewLearningThemeId(
      (current) => current || masters.learningThemes[0]?.id || "",
    );
    setNewDifficultyId(
      (current) => current || masters.difficultyLevels[0]?.id || "",
    );
  }, [masters]);

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
      learningObjective: newLearningObjective.trim() || undefined,
      learningThemeId: newLearningThemeId,
      materialType: newMaterialType,
      specialtyId: newSpecialtyId,
      teachingPoints: teachingPointsFromText(newTeachingPointsText),
      title: newTitle.trim(),
    });
    setNewTitle("");
    setNewLearningObjective("");
    setNewTeachingPointsText("");
    await refresh();
  }

  function teachingPointsFromText(text: string): string[] | undefined {
    const points = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return points.length > 0 ? points : undefined;
  }

  return (
    <section aria-label="教材一覧" className="flex flex-col gap-4">
      <FieldSet>
        <FieldLegend variant="label">検索</FieldLegend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-8">
          <Field>
            <FieldLabel htmlFor="admin-filter-material-type">
              教材種別
            </FieldLabel>
            <OptionSelect
              id="admin-filter-material-type"
              options={[
                { label: "すべて", value: "" },
                ...MATERIAL_TYPES.map((type) => ({
                  label: materialTypeLabel(type),
                  value: type,
                })),
              ]}
              value={filters.materialType ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  materialType: (value as MaterialType) || undefined,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-filter-publication">公開状態</FieldLabel>
            <OptionSelect
              id="admin-filter-publication"
              options={[
                { label: "すべて", value: "" },
                ...PUBLICATION_STATUSES.map((status) => ({
                  label: publicationStatusLabel(status),
                  value: status,
                })),
              ]}
              value={filters.publicationStatus ?? ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  publicationStatus: (value as PublicationStatus) || undefined,
                }))
              }
            />
          </Field>
        </div>
      </FieldSet>

      <ul className="flex flex-col gap-3">
        {(materials ?? []).map((material) => (
          <li key={material.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {material.title}
                  <Badge
                    variant={
                      PUBLICATION_BADGE_VARIANTS[material.publicationStatus]
                    }
                  >
                    {publicationStatusLabel(material.publicationStatus)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {materialTypeLabel(material.materialType)}
                  </Badge>
                  <Badge variant="outline">
                    {material.specialtyId
                      ? tagLabel(masters.specialties, material.specialtyId)
                      : "未設定"}
                  </Badge>
                  <Badge variant="outline">
                    {material.learningThemeId
                      ? tagLabel(
                          masters.learningThemes,
                          material.learningThemeId,
                        )
                      : "未設定"}
                  </Badge>
                  <Badge variant="outline">
                    {material.difficultyId
                      ? tagLabel(
                          masters.difficultyLevels,
                          material.difficultyId,
                        )
                      : "未設定"}
                  </Badge>
                </div>
                {material.learningObjective ? (
                  <p className="text-std-16N-170">
                    学習目標: {material.learningObjective}
                  </p>
                ) : null}
                {material.teachingPoints &&
                material.teachingPoints.length > 0 ? (
                  <ul className="list-disc pl-5 text-std-16N-170">
                    {material.teachingPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-wrap items-end gap-3">
                <Field className="w-56">
                  <FieldLabel htmlFor={`admin-next-status-${material.id}`}>
                    変更後の公開状態
                  </FieldLabel>
                  <OptionSelect
                    id={`admin-next-status-${material.id}`}
                    options={[
                      { label: "選択してください", value: "" },
                      ...PUBLICATION_STATUSES.filter(
                        (status) => status !== material.publicationStatus,
                      ).map((status) => ({
                        label: publicationStatusLabel(status),
                        value: status,
                      })),
                    ]}
                    value={nextStatusById[material.id] ?? ""}
                    onValueChange={(value) =>
                      setNextStatusById((prev) => ({
                        ...prev,
                        [material.id]: value as PublicationStatus,
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  disabled={!nextStatusById[material.id]}
                  onClick={() => void handleChangeStatus(material.id)}
                >
                  変更
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>

      <Card size="sm">
        <CardHeader>
          <CardTitle>新規教材の登録</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="admin-new-title">タイトル</FieldLabel>
            <Input
              id="admin-new-title"
              placeholder="タイトル"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-8">
            <Field>
              <FieldLabel htmlFor="admin-new-material-type">
                教材種別
              </FieldLabel>
              <OptionSelect
                id="admin-new-material-type"
                options={MATERIAL_TYPES.map((type) => ({
                  label: materialTypeLabel(type),
                  value: type,
                }))}
                value={newMaterialType}
                onValueChange={(value) =>
                  setNewMaterialType(value as MaterialType)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-new-specialty">分野</FieldLabel>
              <OptionSelect
                id="admin-new-specialty"
                options={toOptions(masters.specialties)}
                value={newSpecialtyId}
                onValueChange={setNewSpecialtyId}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-new-theme">学習テーマ</FieldLabel>
              <OptionSelect
                id="admin-new-theme"
                options={toOptions(masters.learningThemes)}
                value={newLearningThemeId}
                onValueChange={setNewLearningThemeId}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-new-difficulty">難易度</FieldLabel>
              <OptionSelect
                id="admin-new-difficulty"
                options={toOptions(masters.difficultyLevels)}
                value={newDifficultyId}
                onValueChange={setNewDifficultyId}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="admin-new-objective">
              学習目標（任意。Training
              画面の教材チャットが会話の文脈として使う）
            </FieldLabel>
            <Textarea
              className="min-h-32"
              id="admin-new-objective"
              placeholder="この教材で新人が身につけるべき学習目標"
              value={newLearningObjective}
              onChange={(event) => setNewLearningObjective(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-new-points">
              指導のポイント（任意。1行1項目）
            </FieldLabel>
            <Textarea
              className="min-h-32"
              id="admin-new-points"
              placeholder={
                "単回の測定値だけで結論を出さない\n不足情報を明確にする"
              }
              value={newTeachingPointsText}
              onChange={(event) => setNewTeachingPointsText(event.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            size="sm"
            disabled={!newTitle.trim()}
            onClick={() => void handleAddMaterial()}
          >
            登録
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

/** 新規ルーブリック作成フォームの4レベル分の入力状態。 */
type NewRubricLevelDraft = {
  levelName: string;
  definition: string;
  criteriaText: string;
};

function emptyLevelDrafts(): Record<RubricLevelNumber, NewRubricLevelDraft> {
  return {
    1: { criteriaText: "", definition: "", levelName: "" },
    2: { criteriaText: "", definition: "", levelName: "" },
    3: { criteriaText: "", definition: "", levelName: "" },
    4: { criteriaText: "", definition: "", levelName: "" },
  };
}

function RubricsTab() {
  const [knowledgeBases, setKnowledgeBases] = useState<SoapKnowledgeBase[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newObjective, setNewObjective] = useState("");
  const [newLevels, setNewLevels] = useState(emptyLevelDrafts());

  async function reloadRubrics() {
    setRubrics(await listRubrics());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSoapKnowledgeBases(), listRubrics()]).then(
      ([kbResult, rubricResult]) => {
        if (cancelled) {
          return;
        }
        setKnowledgeBases(kbResult);
        setSelectedKnowledgeBaseId(
          (current) => current || kbResult[0]?.id || "",
        );
        setRubrics(rubricResult);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleActive(rubric: Rubric) {
    await setRubricActive(rubric.id, !rubric.isActive);
    await reloadRubrics();
  }

  async function handleAddRubric() {
    if (
      !selectedKnowledgeBaseId ||
      !newCode.trim() ||
      !newName.trim() ||
      !newObjective.trim() ||
      RUBRIC_LEVEL_NUMBERS.some((level) => !newLevels[level].levelName.trim())
    ) {
      return;
    }
    await addRubric({
      code: newCode.trim(),
      knowledgeBaseId: selectedKnowledgeBaseId,
      levels: RUBRIC_LEVEL_NUMBERS.map((level) => ({
        criteria: newLevels[level].criteriaText
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        definition: newLevels[level].definition.trim(),
        level,
        levelName: newLevels[level].levelName.trim(),
      })),
      name: newName.trim(),
      objective: newObjective.trim(),
    });
    setNewCode("");
    setNewName("");
    setNewObjective("");
    setNewLevels(emptyLevelDrafts());
    await reloadRubrics();
  }

  return (
    <section aria-label="ルーブリック一覧" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {(rubrics ?? []).map((rubric) => (
          <li key={rubric.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {rubric.code} — {rubric.name}
                  <Badge variant={rubric.isActive ? "default" : "secondary"}>
                    {rubric.isActive ? "有効" : "無効"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-std-16N-170">{rubric.objective}</p>
                {rubric.levels.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {rubric.levels.map((level) => (
                      <li
                        key={level.level}
                        className="rounded-lg bg-muted px-3 py-2"
                      >
                        <p className="text-muted-foreground text-dns-14N-130">
                          レベル{level.level}: {level.levelName}
                        </p>
                        <p className="text-std-16N-170">{level.definition}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-std-16N-170">
                    レベル定義は未登録です。
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleActive(rubric)}
                >
                  {rubric.isActive ? "無効にする" : "有効にする"}
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>

      <Card size="sm">
        <CardHeader>
          <CardTitle>新規ルーブリックの登録</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="admin-rubric-kb">Knowledge Base</FieldLabel>
            <OptionSelect
              id="admin-rubric-kb"
              options={knowledgeBases.map((kb) => ({
                label: `${kb.name} (${kb.version})`,
                value: kb.id,
              }))}
              value={selectedKnowledgeBaseId}
              onValueChange={setSelectedKnowledgeBaseId}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-rubric-code">コード</FieldLabel>
            <Input
              id="admin-rubric-code"
              placeholder="コード（例: ASSESSMENT）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-rubric-name">ルーブリック名</FieldLabel>
            <Input
              id="admin-rubric-name"
              placeholder="ルーブリック名"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-rubric-objective">評価目的</FieldLabel>
            <Input
              id="admin-rubric-objective"
              placeholder="評価目的"
              value={newObjective}
              onChange={(event) => setNewObjective(event.target.value)}
            />
          </Field>
          {RUBRIC_LEVEL_NUMBERS.map((level) => (
            <FieldSet key={level}>
              <FieldLegend variant="label">レベル{level}</FieldLegend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-8">
                <Field>
                  <FieldLabel htmlFor={`admin-rubric-level-name-${level}`}>
                    レベル名
                  </FieldLabel>
                  <Input
                    id={`admin-rubric-level-name-${level}`}
                    placeholder="レベル名（例: 要支援）"
                    value={newLevels[level].levelName}
                    onChange={(event) =>
                      setNewLevels((prev) => ({
                        ...prev,
                        [level]: {
                          ...prev[level],
                          levelName: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`admin-rubric-level-def-${level}`}>
                    定義
                  </FieldLabel>
                  <Input
                    id={`admin-rubric-level-def-${level}`}
                    placeholder="定義"
                    value={newLevels[level].definition}
                    onChange={(event) =>
                      setNewLevels((prev) => ({
                        ...prev,
                        [level]: {
                          ...prev[level],
                          definition: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
              </div>
            </FieldSet>
          ))}
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            size="sm"
            disabled={
              !selectedKnowledgeBaseId || !newCode.trim() || !newName.trim()
            }
            onClick={() => void handleAddRubric()}
          >
            登録
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

function KnowledgeBaseTab() {
  const [knowledgeBases, setKnowledgeBases] = useState<SoapKnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<SoapKnowledgeItem[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("1.0");
  const [newItemCategory, setNewItemCategory] = useState<KnowledgeItemCategory>(
    KNOWLEDGE_ITEM_CATEGORIES[0],
  );
  const [newItemKey, setNewItemKey] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemContent, setNewItemContent] = useState("");

  async function reloadKnowledgeBases() {
    const result = await listSoapKnowledgeBases();
    setKnowledgeBases(result);
    setSelectedId((current) => current || result[0]?.id || "");
    return result;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: 初回マウント時に一度だけ読み込む。
  useEffect(() => {
    void reloadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    listSoapKnowledgeItems(selectedId).then((result) => {
      if (!cancelled) {
        setItems(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleAddKnowledgeBase() {
    if (!newCode.trim() || !newName.trim() || !newVersion.trim()) {
      return;
    }
    const created = await addSoapKnowledgeBase({
      code: newCode.trim(),
      name: newName.trim(),
      version: newVersion.trim(),
    });
    setNewCode("");
    setNewName("");
    setNewVersion("1.0");
    await reloadKnowledgeBases();
    setSelectedId(created.id);
  }

  async function handleSetStatus(
    kb: SoapKnowledgeBase,
    status: KnowledgeBaseStatus,
  ) {
    await setSoapKnowledgeBaseStatus(kb.id, status);
    await reloadKnowledgeBases();
  }

  async function handleAddItem() {
    if (
      !selectedId ||
      !newItemKey.trim() ||
      !newItemTitle.trim() ||
      !newItemContent.trim()
    ) {
      return;
    }
    await addSoapKnowledgeItem(selectedId, {
      category: newItemCategory,
      content: newItemContent.trim(),
      itemKey: newItemKey.trim(),
      title: newItemTitle.trim(),
    });
    setNewItemKey("");
    setNewItemTitle("");
    setNewItemContent("");
    setItems(await listSoapKnowledgeItems(selectedId));
  }

  async function toggleItemActive(item: SoapKnowledgeItem) {
    await setSoapKnowledgeItemActive(item.id, !item.isActive);
    setItems(await listSoapKnowledgeItems(selectedId));
  }

  return (
    <section aria-label="Knowledge Base 一覧" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {knowledgeBases.map((kb) => (
          <li key={kb.id}>
            <Card
              size="sm"
              className={kb.id === selectedId ? "ring-2 ring-primary/40" : ""}
            >
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {kb.code} — {kb.name}
                  <Badge variant={KNOWLEDGE_BASE_BADGE_VARIANTS[kb.status]}>
                    {knowledgeBaseStatusLabel(kb.status)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-std-16N-170">
                  version {kb.version}
                  {kb.description ? ` / ${kb.description}` : ""}
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={kb.id === selectedId ? "secondary" : "default"}
                  onClick={() => setSelectedId(kb.id)}
                >
                  項目を表示
                </Button>
                {KNOWLEDGE_BASE_STATUSES.filter(
                  (status) => status !== kb.status,
                ).map((status) => (
                  <Button
                    type="button"
                    key={status}
                    size="sm"
                    variant="outline"
                    onClick={() => void handleSetStatus(kb, status)}
                  >
                    {knowledgeBaseStatusLabel(status)}にする
                  </Button>
                ))}
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>

      <Card size="sm">
        <CardHeader>
          <CardTitle>新規 Knowledge Base の登録</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-8">
          <Field>
            <FieldLabel htmlFor="admin-kb-code">コード</FieldLabel>
            <Input
              id="admin-kb-code"
              placeholder="コード（例: PHN_SOAP_TRAINING）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-kb-name">名称</FieldLabel>
            <Input
              id="admin-kb-name"
              placeholder="名称"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-kb-version">バージョン</FieldLabel>
            <Input
              id="admin-kb-version"
              placeholder="バージョン（例: 1.0）"
              value={newVersion}
              onChange={(event) => setNewVersion(event.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            size="sm"
            disabled={!newCode.trim() || !newName.trim() || !newVersion.trim()}
            onClick={() => void handleAddKnowledgeBase()}
          >
            登録
          </Button>
        </CardFooter>
      </Card>

      {selectedId ? (
        <section aria-label="知識項目一覧" className="flex flex-col gap-3">
          <h5 className="text-std-16B-170">
            知識項目（SOAP_RULE / SAFETY / FEEDBACK_POLICY 等）
          </h5>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-dns-14N-130">
                      [{knowledgeItemCategoryLabel(item.category)}] {item.title}
                    </p>
                    <p className="whitespace-pre-wrap text-std-16N-170">
                      {item.content}
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleItemActive(item)}
                    >
                      {item.isActive ? "無効にする" : "有効にする"}
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>

          <Card size="sm">
            <CardHeader>
              <CardTitle>知識項目の追加</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-8">
                <Field>
                  <FieldLabel htmlFor="admin-item-category">
                    カテゴリ
                  </FieldLabel>
                  <OptionSelect
                    id="admin-item-category"
                    options={KNOWLEDGE_ITEM_CATEGORIES.map((category) => ({
                      label: knowledgeItemCategoryLabel(category),
                      value: category,
                    }))}
                    value={newItemCategory}
                    onValueChange={(value) =>
                      setNewItemCategory(value as KnowledgeItemCategory)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="admin-item-key">項目キー</FieldLabel>
                  <Input
                    id="admin-item-key"
                    placeholder="項目キー"
                    value={newItemKey}
                    onChange={(event) => setNewItemKey(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="admin-item-title">表示名</FieldLabel>
                  <Input
                    id="admin-item-title"
                    placeholder="表示名"
                    value={newItemTitle}
                    onChange={(event) => setNewItemTitle(event.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="admin-item-content">本文</FieldLabel>
                <Textarea
                  className="min-h-32"
                  id="admin-item-content"
                  placeholder="本文（Prompt投入可能な内容）"
                  value={newItemContent}
                  onChange={(event) => setNewItemContent(event.target.value)}
                />
              </Field>
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                size="sm"
                disabled={
                  !newItemKey.trim() ||
                  !newItemTitle.trim() ||
                  !newItemContent.trim()
                }
                onClick={() => void handleAddItem()}
              >
                追加
              </Button>
            </CardFooter>
          </Card>
        </section>
      ) : null}
    </section>
  );
}

function PromptTemplatesTab() {
  const [knowledgeBases, setKnowledgeBases] = useState<SoapKnowledgeBase[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[] | null>(null);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSystemPrompt, setNewSystemPrompt] = useState("");
  const [newUserPromptTemplate, setNewUserPromptTemplate] = useState("");

  async function reloadTemplates() {
    setTemplates(await listPromptTemplates());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSoapKnowledgeBases(), listPromptTemplates()]).then(
      ([kbResult, templateResult]) => {
        if (cancelled) {
          return;
        }
        setKnowledgeBases(kbResult);
        setSelectedKnowledgeBaseId(
          (current) => current || kbResult[0]?.id || "",
        );
        setTemplates(templateResult);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd() {
    if (
      !selectedKnowledgeBaseId ||
      !newCode.trim() ||
      !newName.trim() ||
      !newSystemPrompt.trim() ||
      !newUserPromptTemplate.trim()
    ) {
      return;
    }
    await addPromptTemplate({
      code: newCode.trim(),
      knowledgeBaseId: selectedKnowledgeBaseId,
      name: newName.trim(),
      systemPrompt: newSystemPrompt.trim(),
      userPromptTemplate: newUserPromptTemplate.trim(),
    });
    setNewCode("");
    setNewName("");
    setNewSystemPrompt("");
    setNewUserPromptTemplate("");
    await reloadTemplates();
  }

  return (
    <section aria-label="Prompt Template 一覧" className="flex flex-col gap-4">
      <p className="text-muted-foreground text-std-16N-170">
        現時点では AgentCore
        の実行には未接続で、管理・保管のみを行う（将来対応）。
      </p>
      <ul className="flex flex-col gap-3">
        {(templates ?? []).map((template) => (
          <li key={template.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {template.code} — {template.name}
                  <Badge variant="outline">version {template.version}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="whitespace-pre-wrap text-std-16N-170">
                  {template.systemPrompt}
                </p>
                <p className="whitespace-pre-wrap text-std-16N-170">
                  {template.userPromptTemplate}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card size="sm">
        <CardHeader>
          <CardTitle>新規 Prompt Template の登録</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="admin-template-kb">Knowledge Base</FieldLabel>
            <OptionSelect
              id="admin-template-kb"
              options={knowledgeBases.map((kb) => ({
                label: `${kb.name} (${kb.version})`,
                value: kb.id,
              }))}
              value={selectedKnowledgeBaseId}
              onValueChange={setSelectedKnowledgeBaseId}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-8">
            <Field>
              <FieldLabel htmlFor="admin-template-code">コード</FieldLabel>
              <Input
                id="admin-template-code"
                placeholder="コード"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-template-name">名称</FieldLabel>
              <Input
                id="admin-template-name"
                placeholder="名称"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="admin-template-system">
              System Prompt
            </FieldLabel>
            <Textarea
              className="min-h-32"
              id="admin-template-system"
              placeholder="System Prompt"
              value={newSystemPrompt}
              onChange={(event) => setNewSystemPrompt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-template-user">
              User Prompt Template
            </FieldLabel>
            <Textarea
              className="min-h-32"
              id="admin-template-user"
              placeholder="User Prompt Template"
              value={newUserPromptTemplate}
              onChange={(event) => setNewUserPromptTemplate(event.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            size="sm"
            disabled={
              !selectedKnowledgeBaseId || !newCode.trim() || !newName.trim()
            }
            onClick={() => void handleAdd()}
          >
            登録
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
