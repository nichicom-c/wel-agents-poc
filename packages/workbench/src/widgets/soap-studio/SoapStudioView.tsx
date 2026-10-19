import { SendIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useState } from "react";

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
import { Message, MessageContent, MessageGroup } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  addManualCandidate,
  buildReflectionSelections,
  confidenceTier,
  fromApiCandidates,
  groupByCategory,
  postSoapDraft,
  type ReflectionSelections,
  SOAP_CATEGORY_ACCENTS,
  SOAP_RECORD_TYPES,
  type SoapCandidateStatus,
  type SoapCategory,
  type SoapDraftCandidate,
  soapRecordTypeLabel,
  toggleReflectionSelection,
  withEditedText,
  withStatus,
} from "../../features/soap-draft/index.ts";
import {
  appendAssistantMessage,
  appendUserMessage,
  type ChatMessage,
  type GapApiItem,
  gapTypeLabel,
  latestAssistantSuggestions,
  postSoapGaps,
  postSoapGapsChat,
} from "../../features/soap-gaps/index.ts";
import {
  postSoapRecord,
  type SavedRecordIds,
  savableItemsFromCandidates,
  withSavedRecordId,
} from "../../features/soap-records/index.ts";

const CATEGORY_LABELS: Record<SoapCategory, string> = {
  S: "S・主観的情報",
  O: "O・客観的情報",
  A: "A・アセスメント",
  P: "P・支援計画",
  UNCLASSIFIED: "該当なし",
};

const STATUS_LABELS: Record<SoapCandidateStatus, string> = {
  pending: "未対応",
  adopted: "採用",
  edited: "編集済み",
  rejected: "却下",
  deferred: "後で確認",
};

const CONFIDENCE_BADGE_VARIANTS: Record<
  ReturnType<typeof confidenceTier>,
  "default" | "secondary" | "destructive"
> = {
  high: "default",
  medium: "secondary",
  low: "destructive",
};

type AnalyzeStatus = "idle" | "loading" | "error";
type GapsStatus = "idle" | "loading" | "error";
type ChatStatus = "idle" | "loading" | "error";
type SaveStatus = "idle" | "loading" | "error";

/** ルールベースで検出した不足の同一性キー（`resolvedGapKeys` の判定に使う）。 */
function gapKey(gap: GapApiItem): string {
  return `${gap.gapType}:${gap.soapCategory}:${gap.targetItem}:${gap.detail}`;
}

function toApiCandidates(candidates: SoapDraftCandidate[]) {
  return candidates.map(
    ({ category, draftText, evidenceQuote, reasoning, confidence }) => ({
      category,
      draftText,
      evidenceQuote,
      reasoning,
      confidence,
    }),
  );
}

export type SoapStudioViewProps = {
  /** Voice Capture など他画面から引き継ぐ入力素材テキスト。渡されると textarea に反映する。 */
  seedText?: string;
  /** seedText の由来（例: 「音声記録 rec-xxx」）。反映後も画面に表示し続ける traceability 用の tag。 */
  seedSourceLabel?: string;
  /** seedText を textarea へ反映し終えたことを呼び出し側へ伝える（再訪時の再反映を防ぐ）。 */
  onSeedConsumed?: () => void;
};

export function SoapStudioView({
  seedText,
  seedSourceLabel,
  onSeedConsumed,
}: SoapStudioViewProps = {}) {
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [candidates, setCandidates] = useState<SoapDraftCandidate[] | null>(
    null,
  );
  const [reflectionSelections, setReflectionSelections] =
    useState<ReflectionSelections | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeStatus>("idle");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [gapQueue, setGapQueue] = useState<GapApiItem[] | null>(null);
  const [resolvedGapKeys, setResolvedGapKeys] = useState<Set<string>>(
    new Set(),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConversationId, setChatConversationId] = useState<
    string | undefined
  >(undefined);
  const [chatInputText, setChatInputText] = useState("");
  const [gapsStatus, setGapsStatus] = useState<GapsStatus>("idle");
  const [gapsError, setGapsError] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [chatError, setChatError] = useState("");
  const [savedRecordIds, setSavedRecordIds] = useState<SavedRecordIds>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  /** キュー中、まだ resolvedGapKeys に含まれない最初の不足（無ければ全件対応済み）。 */
  const activeGap = (gapQueue ?? []).find(
    (gap) => !resolvedGapKeys.has(gapKey(gap)),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: seedText の到着だけを検知したい（onSeedConsumed/seedSourceLabel は同時に渡される値）。
  useEffect(() => {
    if (!seedText) {
      return;
    }
    setText(seedText);
    setSourceLabel(seedSourceLabel ?? "");
    onSeedConsumed?.();
  }, [seedText]);

  async function handleAnalyze() {
    if (!text.trim() || analyzeStatus === "loading") {
      return;
    }
    setAnalyzeStatus("loading");
    setError("");
    setGapQueue(null);
    setResolvedGapKeys(new Set());
    setChatMessages([]);
    setChatConversationId(undefined);
    setChatInputText("");
    setGapsStatus("idle");
    setGapsError("");
    setChatStatus("idle");
    setChatError("");
    try {
      const result = await postSoapDraft({ text });
      setCandidates(fromApiCandidates(result.candidates));
      setReflectionSelections(
        buildReflectionSelections(result.recommendedRecordTypes),
      );
      setAnalyzeStatus("idle");
    } catch (caught) {
      setAnalyzeStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /**
   * 不足確認チャットの1ターンを実行する。resolved になれば（候補があれば採用し）次の未解決の
   * 不足を自動で提示し続ける（AI主導）。すべて解決したら完了メッセージを表示する。
   * `queue`/`currentCandidates`/`resolvedKeys` は React state の非同期反映に左右されないよう、
   * 呼び出し元から明示的に受け取って引き回す。
   */
  async function runChatTurn(
    queue: GapApiItem[],
    currentCandidates: SoapDraftCandidate[],
    gap: GapApiItem,
    conversationId: string | undefined,
    resolvedKeys: Set<string>,
    message?: string,
  ) {
    setChatStatus("loading");
    setChatError("");
    try {
      const result = await postSoapGapsChat({
        candidates: toApiCandidates(currentCandidates),
        conversationId,
        gap,
        message,
      });
      setChatConversationId(result.conversationId);
      setChatMessages((prev) =>
        appendAssistantMessage(prev, result.message, result.suggestions),
      );

      if (!result.resolved) {
        setChatStatus("idle");
        return;
      }

      const nextResolvedKeys = new Set(resolvedKeys);
      nextResolvedKeys.add(gapKey(gap));
      setResolvedGapKeys(nextResolvedKeys);

      let nextCandidates = currentCandidates;
      if (result.candidateText) {
        nextCandidates = addManualCandidate(currentCandidates, {
          category: gap.soapCategory,
          draftText: result.candidateText,
          evidenceQuote: result.candidateText,
          reasoning: `不足確認チャット「${gap.detail}」への回答として追加。`,
          confidence: 1,
        });
        setCandidates(nextCandidates);
      }

      const nextGap = queue.find((item) => !nextResolvedKeys.has(gapKey(item)));
      if (nextGap) {
        await runChatTurn(
          queue,
          nextCandidates,
          nextGap,
          result.conversationId,
          nextResolvedKeys,
        );
        return;
      }

      setChatMessages((prev) =>
        appendAssistantMessage(
          prev,
          "不足確認はこれで完了です。内容を確認し、正式記録として保存してください。",
        ),
      );
      setChatStatus("idle");
    } catch (caught) {
      setChatStatus("error");
      setChatError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleStartGapChat() {
    if (!candidates || candidates.length === 0 || gapsStatus === "loading") {
      return;
    }
    setGapsStatus("loading");
    setGapsError("");
    setChatMessages([]);
    setChatConversationId(undefined);
    setChatInputText("");
    setResolvedGapKeys(new Set());
    setChatError("");
    try {
      const result = await postSoapGaps({
        candidates: toApiCandidates(candidates),
      });
      setGapQueue(result.gaps);
      setGapsStatus("idle");
      if (result.gaps.length === 0) {
        setChatMessages(
          appendAssistantMessage(
            [],
            "不足は見つかりませんでした。このまま正式記録として保存できます。",
          ),
        );
        return;
      }
      const firstGap = result.gaps[0];
      if (firstGap) {
        await runChatTurn(
          result.gaps,
          candidates,
          firstGap,
          undefined,
          new Set(),
        );
      }
    } catch (caught) {
      setGapsStatus("error");
      setGapsError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function handleSendChatMessage() {
    const trimmed = chatInputText.trim();
    if (!activeGap || !trimmed || !candidates || chatStatus === "loading") {
      return;
    }
    setChatMessages((prev) => appendUserMessage(prev, trimmed));
    setChatInputText("");
    void runChatTurn(
      gapQueue ?? [],
      candidates,
      activeGap,
      chatConversationId,
      resolvedGapKeys,
      trimmed,
    );
  }

  function handleSkipCurrentGap() {
    if (!activeGap?.skippable || !candidates || chatStatus === "loading") {
      return;
    }
    const skipText = "スキップします。";
    setChatMessages((prev) => appendUserMessage(prev, skipText));
    void runChatTurn(
      gapQueue ?? [],
      candidates,
      activeGap,
      chatConversationId,
      resolvedGapKeys,
      skipText,
    );
  }

  /** 提案チップは即送信ではなく、編集してから送れるよう入力欄へ挿入するだけにする。 */
  function handleSuggestionClick(suggestion: string) {
    setChatInputText(suggestion);
  }

  function handleStatusChange(id: string, next: SoapCandidateStatus) {
    setCandidates((prev) => (prev ? withStatus(prev, id, next) : prev));
  }

  function handleReflectionToggle(
    recordType: (typeof SOAP_RECORD_TYPES)[number],
  ) {
    setReflectionSelections((prev) =>
      prev ? toggleReflectionSelection(prev, recordType) : prev,
    );
  }

  /**
   * 反映候補でチェックされている記録種別それぞれについて、正式記録として保存する
   * （issue #8 の前提。docs/notes/2026-07-30-... の「新規: SOAP Studio → 正式記録保存 →
   * Knowledge Review」参照）。同じセッション内で既に保存済みの記録種別は、新規記録では
   * なく version を追記する（`savedRecordIds`）。採用/編集済みの候補が無い記録種別は
   * 保存対象から除く。
   */
  async function handleSaveRecords() {
    if (!candidates || !reflectionSelections || saveStatus === "loading") {
      return;
    }

    const targetTypes = SOAP_RECORD_TYPES.filter(
      (recordType) => reflectionSelections[recordType],
    );
    const items = savableItemsFromCandidates(candidates);

    if (targetTypes.length === 0 || items.length === 0) {
      setSaveStatus("error");
      setSaveError(
        "保存する記録種別（反映候補）を1つ以上チェックし、採用または編集済みの候補を1件以上作ってください。",
      );
      return;
    }

    setSaveStatus("loading");
    setSaveError("");
    setSaveNotice("");

    const source = sourceLabel ? "voice_capture" : "soap_draft_ai";
    const savedNotices: string[] = [];

    try {
      let nextSavedRecordIds = savedRecordIds;
      for (const recordType of targetTypes) {
        const result = await postSoapRecord({
          items,
          recordId: nextSavedRecordIds[recordType],
          recordType,
          source,
        });
        nextSavedRecordIds = withSavedRecordId(
          nextSavedRecordIds,
          recordType,
          result.recordId,
        );
        savedNotices.push(
          `${soapRecordTypeLabel(recordType)}: version ${result.versionNo} として保存しました`,
        );
      }
      setSavedRecordIds(nextSavedRecordIds);
      setSaveNotice(savedNotices.join(" / "));
      setSaveStatus("idle");
    } catch (caught) {
      setSaveStatus("error");
      setSaveError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function startEditing(candidate: SoapDraftCandidate) {
    setEditingId(candidate.id);
    setEditingText(candidate.draftText);
  }

  function saveEditing() {
    if (!editingId) {
      return;
    }
    setCandidates((prev) =>
      prev ? withEditedText(prev, editingId, editingText) : prev,
    );
    setEditingId(null);
    setEditingText("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingText("");
  }

  const groups = candidates ? groupByCategory(candidates) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-std-24B-150">SOAP Studio</h2>
        <p className="text-muted-foreground text-std-16N-170">
          入力素材から SOAP 下書きと不足確認を作る作業画面
        </p>
      </div>

      <section
        aria-label="SOAP 下書き生成"
        aria-busy={analyzeStatus === "loading"}
      >
        <Card>
          <CardHeader>
            <CardTitle>SOAP 下書き生成</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sourceLabel ? (
              <div>
                <Badge variant="outline">由来: {sourceLabel}</Badge>
              </div>
            ) : null}
            <Textarea
              className="min-h-48"
              aria-label="入力素材テキスト"
              placeholder="テキスト、編集済み transcript、会議メモなどを貼り付けてください"
              value={text}
              disabled={analyzeStatus === "loading"}
              onChange={(event) => setText(event.target.value)}
            />
            {analyzeStatus === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!text.trim() || analyzeStatus === "loading"}
              onClick={() => void handleAnalyze()}
            >
              {analyzeStatus === "loading" ? "解析中…" : "解析"}
            </Button>
            {analyzeStatus === "loading" ? (
              <p
                className="flex items-center gap-2 text-muted-foreground text-std-16N-170"
                role="status"
                aria-live="polite"
              >
                <Spinner />
                解析中…（30秒ほどかかることがあります）
              </p>
            ) : null}
          </CardFooter>
        </Card>
      </section>

      {candidates && reflectionSelections ? (
        <section aria-label="SOAP 下書き候補" className="flex flex-col gap-4">
          <FieldSet>
            <FieldLegend variant="label">反映候補</FieldLegend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {SOAP_RECORD_TYPES.map((recordType) => (
                <Field key={recordType} orientation="horizontal">
                  <Checkbox
                    id={`soap-reflection-${recordType}`}
                    checked={reflectionSelections[recordType]}
                    onCheckedChange={() => handleReflectionToggle(recordType)}
                  />
                  <FieldLabel htmlFor={`soap-reflection-${recordType}`}>
                    {soapRecordTypeLabel(recordType)}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>

          {candidates.length === 0 ? (
            <p className="text-muted-foreground text-std-16N-170">
              候補が見つかりませんでした。
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="flex flex-col gap-2">
                <h4
                  className={cn(
                    "text-std-16N-170 font-bold",
                    SOAP_CATEGORY_ACCENTS[group.category].text,
                  )}
                >
                  {CATEGORY_LABELS[group.category]}
                </h4>
                {group.candidates.length === 0 ? (
                  <p className="text-muted-foreground text-std-16N-170">
                    該当なし
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {group.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <Card
                          size="sm"
                          className={cn(
                            "border-l-4",
                            SOAP_CATEGORY_ACCENTS[candidate.category].border,
                            candidate.status === "rejected" && "opacity-60",
                            candidate.status === "adopted" &&
                              "ring-2 ring-primary/40",
                          )}
                        >
                          <CardContent className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  CONFIDENCE_BADGE_VARIANTS[
                                    confidenceTier(candidate.confidence)
                                  ]
                                }
                              >
                                確信度 {Math.round(candidate.confidence * 100)}%
                              </Badge>
                              <Badge variant="outline">
                                {STATUS_LABELS[candidate.status]}
                              </Badge>
                            </div>
                            {editingId === candidate.id ? (
                              <Textarea
                                className="min-h-32"
                                aria-label="下書き文章を編集"
                                value={editingText}
                                onChange={(event) =>
                                  setEditingText(event.target.value)
                                }
                              />
                            ) : (
                              <>
                                <p className="text-std-16N-170">
                                  {candidate.draftText}
                                </p>
                                <blockquote className="border-l-2 border-border pl-3 text-muted-foreground text-std-16N-170">
                                  {candidate.evidenceQuote}
                                </blockquote>
                                <p className="text-muted-foreground text-dns-14N-130">
                                  {candidate.reasoning}
                                </p>
                              </>
                            )}
                          </CardContent>
                          <CardFooter className="flex flex-wrap gap-2">
                            {editingId === candidate.id ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={saveEditing}
                                >
                                  保存
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEditing}
                                >
                                  キャンセル
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    handleStatusChange(candidate.id, "adopted")
                                  }
                                >
                                  採用
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditing(candidate)}
                                >
                                  編集
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleStatusChange(candidate.id, "rejected")
                                  }
                                >
                                  却下
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleStatusChange(candidate.id, "deferred")
                                  }
                                >
                                  後で確認
                                </Button>
                              </>
                            )}
                          </CardFooter>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <section
          aria-label="不足確認"
          aria-busy={gapsStatus === "loading" || chatStatus === "loading"}
        >
          <Card>
            <CardHeader>
              <CardTitle>不足確認</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground text-std-16N-170">
                検出した不足を優先度順にAIとチャットで1件ずつ埋め、SOAPを完成させます。
              </p>
              <div>
                <Button
                  type="button"
                  disabled={
                    gapsStatus === "loading" || chatStatus === "loading"
                  }
                  onClick={() => void handleStartGapChat()}
                >
                  {gapsStatus === "loading" || chatStatus === "loading"
                    ? "確認中…"
                    : "不足をチャットで確認"}
                </Button>
              </div>
              {gapsStatus === "error" ? (
                <Alert variant="destructive">
                  <AlertDescription>{gapsError}</AlertDescription>
                </Alert>
              ) : null}

              {chatMessages.length > 0 ? (
                <div
                  className="flex flex-col gap-4"
                  role="log"
                  aria-label="不足確認チャット"
                >
                  <MessageGroup className="gap-4">
                    {chatMessages.map((message) => (
                      <Message
                        key={message.id}
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <MessageContent>
                          <p className="rounded-lg bg-muted px-3 py-2 text-std-16N-170">
                            {message.text}
                          </p>
                        </MessageContent>
                      </Message>
                    ))}
                  </MessageGroup>

                  {activeGap && chatStatus !== "loading" ? (
                    <>
                      {latestAssistantSuggestions(chatMessages).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {latestAssistantSuggestions(chatMessages).map(
                            (suggestion) => (
                              <Button
                                type="button"
                                key={suggestion}
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleSuggestionClick(suggestion)
                                }
                              >
                                {suggestion}
                              </Button>
                            ),
                          )}
                        </div>
                      ) : null}

                      <Field>
                        <FieldLabel
                          htmlFor="soap-gaps-chat-input"
                          title={activeGap.detail}
                        >
                          {gapTypeLabel(activeGap.gapType)} ／{" "}
                          {CATEGORY_LABELS[activeGap.soapCategory]}
                        </FieldLabel>
                        <Textarea
                          id="soap-gaps-chat-input"
                          aria-label="チャットへの返信"
                          placeholder="回答を入力してください"
                          value={chatInputText}
                          onChange={(event) =>
                            setChatInputText(event.target.value)
                          }
                        />
                      </Field>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          disabled={!chatInputText.trim()}
                          onClick={handleSendChatMessage}
                        >
                          <SendIcon data-icon="inline-start" />
                          送信
                        </Button>
                        {activeGap.skippable ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSkipCurrentGap}
                          >
                            <SkipForwardIcon data-icon="inline-start" />
                            スキップ
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {chatStatus === "loading" ? (
                    <p
                      className="flex items-center gap-2 text-muted-foreground text-std-16N-170"
                      role="status"
                      aria-live="polite"
                    >
                      <Spinner />
                      返信を作成中…
                    </p>
                  ) : null}
                  {chatStatus === "error" ? (
                    <Alert variant="destructive">
                      <AlertDescription>{chatError}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {candidates && reflectionSelections ? (
        <section
          aria-label="正式記録として保存"
          aria-busy={saveStatus === "loading"}
        >
          <Card>
            <CardHeader>
              <CardTitle>正式記録として保存</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-std-16N-170">
                反映候補でチェックした記録種別ごとに、採用/編集済みの候補を正式記録として保存します
                （このセッションで同じ記録種別を再度保存すると、新しい版として追記されます）。
              </p>
              {saveStatus === "error" ? (
                <Alert variant="destructive">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
              {saveNotice ? (
                <Alert role="status">
                  <AlertDescription>{saveNotice}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                disabled={saveStatus === "loading"}
                onClick={() => void handleSaveRecords()}
              >
                {saveStatus === "loading" ? "保存中…" : "正式記録として保存"}
              </Button>
            </CardFooter>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
