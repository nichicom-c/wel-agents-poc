-- soap-gaps のルールベース不足検出設定（packages/agentcore/contracts/soap-gap-rules.ts の
-- SoapGapRuleConfig）を knowledge_item（DOMAIN_RULE カテゴリ）として外部化する。
-- content は JSON 文字列で、現行のハードコード値（既定値）と完全に同じ内容にする。
-- item_key は packages/bff/contracts/soap-knowledge-base.ts の
-- SOAP_GAP_RULE_CONFIG_ITEM_KEY と一致させること。

insert into knowledge_item (id, knowledge_base_id, category, item_key, title, content) values
  (
    '11000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000001',
    'DOMAIN_RULE',
    'soap_gap_detection_rules',
    '不足確認チャットのルール検出設定 (JSON)',
    '{
      "lowConfidenceThreshold": 0.4,
      "followUpPlanKeywords": ["次回", "予定", "フォロー", "経過観察", "再評価", "再検討", "継続", "訪問予定"],
      "datePattern": "\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|\\d{4}\\s*年|来週|来月|今週中|今月中|明日|再来週|再来月",
      "methodKeywords": ["訪問", "電話", "面談", "オンライン", "来所", "メール", "手紙", "同行"],
      "responsibleKeywords": ["担当", "ケアマネ", "相談員", "主治医", "看護師", "職員", "本人", "家族", "支援員"],
      "ambiguousKeywords": ["たぶん", "かもしれない", "のような", "適宜", "様子を見る", "検討する", "できれば", "なるべく", "多分", "おそらく", "そのうち", "近いうちに", "など"],
      "contradictionWordPairs": [
        ["改善", "悪化"],
        ["できる", "できない"],
        ["増加", "減少"],
        ["安定", "不安定"],
        ["良好", "不良"],
        ["賛成", "反対"],
        ["希望", "拒否"],
        ["継続", "中止"]
      ],
      "messages": {
        "missingAssessment": "S/Oの内容に対するアセスメント（A：課題・リスク・強みの評価）がまだ作成されていません。",
        "missingPlan": "アセスメント（A）を踏まえた支援計画（P）がまだ作成されていません。",
        "insufficientReasoning": "アセスメント「{draftText}」の根拠となる S（主観的情報）または O（客観的情報）が見当たりません。",
        "followUpMissingDate": "次回予定「{draftText}」に実施日が明記されていません。",
        "followUpMissingMethod": "次回予定「{draftText}」に実施方法（訪問/電話など）が明記されていません。",
        "followUpMissingResponsible": "次回予定「{draftText}」に担当者が明記されていません。",
        "ambiguous": "「{draftText}」に曖昧な表現（{keyword}）が含まれています。",
        "contradiction": "「{draftTextA}」と「{draftTextB}」の間に矛盾する可能性のある記述（{wordA}/{wordB}）があります。",
        "reviewUnclassified": "「{draftText}」は SOAP 区分が未分類のため確認をおすすめします。",
        "reviewLowConfidence": "「{draftText}」は分類の確信度が低いため確認をおすすめします。"
      }
    }'
  )
on conflict (knowledge_base_id, category, item_key, version) do nothing;
