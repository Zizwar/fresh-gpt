import { HandlerContext } from "$fresh/server.ts";
import { getCookies } from "$std/http/cookie.ts";
import { emojify } from "emojify";
import { databaseLoader } from "@/communication/database.ts";
import { RoomChannel } from "@/communication/channel.ts";
import { cleanBadWors } from "@/helpers/bad_words.ts";
import { ApiSendMessage } from "@/communication/types.ts";

import { OpenAI } from "openai";

export async function handler(
  req: Request,
  _ctx: HandlerContext
): Promise<Response> {
  const accessToken = getCookies(req.headers)["roomy_prompt_token"];
  if (!accessToken) {
    return new Response("Not signed in", { status: 401 });
  }
  const database = await databaseLoader.getInstance();
 
  const user = await database.getUserByAccessTokenOrThrow(accessToken);
  const data = (await req.json()) as ApiSendMessage;
  const channel = new RoomChannel(data.roomId); 
  const proomy = await database.getRoomPrompt(data.roomId);

  const from = {
    name: user.userName,
    avatarUrl: user.avatarUrl,
  };

  if (data.kind === "isTyping") {
    // Send `is typing...` indicator.
    channel.sendIsTyping(from);
  }

  const message = emojify(cleanBadWors(data.message));

  channel.sendText({
    message: message,
    from,
    createdAt: new Date().toISOString(),
  });

  await database.insertMessage({
    text: message,
    roomId: data.roomId,
    userId: user.userId,
  });

  ///paly ai
  if (!message?.startsWith("@") && proomy) {
    const openAI = new OpenAI(Deno.env.get("KEY_OPEN_AI") ?? "");

    const from = {
      name: "JPT",
      avatarUrl: "https://jpt.ma/favicon.ico",
    };
    channel.sendIsTyping(from);

    const userContent = message.replace("@", "")
    
    const chatCompletion = await openAI.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: proomy },
        { role: "user", content: userContent },
      ],
    });

    const choices = chatCompletion?.choices || [];

    const text = choices[0]?.message?.content || 'Review the error message: Read the error message carefully to understand the specific problem that occurred. Look for any details or hints provided in the error message that can help diagnose the issue.';

    await database.insertMessage({
      text: `${user.userName || ""}: ${text}`,
      roomId: data.roomId,
      userId: 12345666,
      to:user.userId,

    });

    channel.sendText({
      message: `@${user.userName || ""}:\r\n${text}`,
      from,
      createdAt: new Date().toISOString(),
    });
  }
  //// end ai
  channel.close();

  return new Response("OK");
}
