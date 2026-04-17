import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

const GUARD_PROMPT = `あなたは高校の授業支援AIです。歴史の授業のジグソー学習をサポートします。授業に無関係な話題、不適切・差別的な内容には一切応じず、「授業に関係する質問をしてください」と返してください。\n\n`;

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://tk2125.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, payload } = await req.json();

    let messages: Array<{ role: string; content: string }> = [];
    let systemPrompt = "";

    if (type === "summary_feedback") {
      // 要約へのフィードバック
      systemPrompt = GUARD_PROMPT + `あなたは高校歴史の教師です。生徒の資料要約を読んで、簡潔で建設的なフィードバックを200字以内で返してください。
良い点を1つ、改善できる点を1つ挙げる形式にしてください。専門用語は使わず、生徒が理解できる言葉で書いてください。`;
      messages = [
        {
          role: "user",
          content: `【資料の内容】\n${payload.materialContent}\n\n【生徒の要約】\n${payload.summaryText}`,
        },
      ];
    } else if (type === "explanation_start") {
      // 説明練習開始（AIが生徒役として最初の質問を返す）
      systemPrompt = GUARD_PROMPT + `あなたは高校生です。クラスメートから歴史の資料内容を教えてもらっています。
内容を理解しようと、素直な疑問や確認の質問を1〜2つ投げかけてください。
専門用語は知らないふりをして、わかりやすく聞いてください。
50字以内で質問してください。`;
      messages = [
        {
          role: "user",
          content: `クラスメートが以下の内容を説明しようとしています。最初の質問をしてください。\n\n${payload.summaryText}`,
        },
      ];
    } else if (type === "explanation_continue") {
      // 説明練習の続き
      systemPrompt = GUARD_PROMPT + `あなたは高校生です。クラスメートから歴史の資料内容を教えてもらっています。
相手の説明を聞いて、理解を深めるための質問や「なるほど」という反応を返してください。
会話が3往復以上続いたら「よく分かった！ありがとう」と締めくくってください。
50字以内で返してください。`;
      messages = payload.messages;
    } else if (type === "opinion_feedback") {
      // Opinionへのフィードバック
      systemPrompt = GUARD_PROMPT + `あなたは高校歴史の教師です。生徒のOpinion（意見文）を読んで、以下のルーブリック基準を参考に改善のためのフィードバックを250字以内で返してください。

【ルーブリック基準】
論理（ロジック）: ${payload.rubricLogicCriteria}
根拠（ソース）: ${payload.rubricSourceCriteria}

フィードバックは：
1. 良かった点（1文）
2. 論理面での改善アドバイス（1文）
3. 根拠面での改善アドバイス（1文）
の形式にしてください。`;

      const usedTermsList =
        payload.usedTerms?.length > 0
          ? `使用した指定語句：${payload.usedTerms.join("、")}`
          : "指定語句は使用されていません";

      messages = [
        {
          role: "user",
          content: `【中心発問】\n${payload.centralQuestion}\n\n【選んだ立場】\n${payload.positionChoice}\n\n${usedTermsList}\n\n【生徒の意見文】\n${payload.opinionText}`,
        },
      ];
    } else if (type === "copy_check") {
      // コピペ判定
      systemPrompt = `あなたは高校の教師です。生徒の要約が資料をほぼそのままコピーしているかどうかを判定してください。必ずJSON形式のみで回答し、他のテキストは一切含めないでください。`;
      messages = [
        {
          role: "user",
          content: `以下の【資料】と【生徒の要約】を比較してください。\n生徒の要約が資料をほぼそのままコピーしている場合は {"copied": true, "feedback": "アドバイス文"} を返してください。\n自分の言葉でまとめられていれば {"copied": false, "feedback": ""} を返してください。\nfeedbackは生徒への優しい一言アドバイス（30字以内）にしてください。\n\n【資料】\n${payload.materialContent}\n\n【生徒の要約】\n${payload.summaryText}`,
        },
      ];
    } else {
      return new Response(JSON.stringify({ error: "Unknown type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    return new Response(JSON.stringify({ message: assistantMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
