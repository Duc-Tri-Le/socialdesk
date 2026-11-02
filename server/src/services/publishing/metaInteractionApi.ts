const FB_GRAPH_API_VERSION = "v22.0";
const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}`;

export interface PostMetricsResult {
  ok: boolean;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
  error?: string;
}


export interface RecentPostItem {
  id: string;
  message: string;
  created_time: string;
  permalink?: string;
  comments_count: number;
  likes_count: number;
}

export interface CommentItem {
  id: string;
  from?: {
    id: string;
    name: string;
  };
  text: string;
  created_time: string;
  like_count?: number;
  user_likes?: boolean;
}

export interface ConversationItem {
  id: string;
  snippet: string;
  updated_time: string;
  unread_count: number;
  participants: Array<{
    id: string;
    name: string;
    email?: string;
  }>;
}

export interface MessageItem {
  id: string;
  text: string;
  created_time: string;
  from: {
    id: string;
    name: string;
    email?: string;
  };
}

/**
 * 1. QUÉT CHỈ SỐ BÀI VIẾT (Facebook & Instagram)
 */
export async function getFacebookPostMetrics(
  postId: string,
  accessToken: string,
): Promise<PostMetricsResult> {
  if (!postId || !accessToken) {
    return { ok: false, likes: 0, comments: 0, shares: 0, error: "Thiếu Post ID hoặc Access Token" };
  }
  let cleanId = postId.trim();
  if (/^https?:\/\//i.test(cleanId)) {
    const fbMatch = cleanId.match(/posts\/([0-9_]+)|\/([0-9]{10,})/);
    if (fbMatch) {
      cleanId = fbMatch[1] || fbMatch[2] || cleanId;
    }
  }
  const cleanToken = accessToken.trim();
  const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}?fields=shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        likes: 0,
        comments: 0,
        shares: 0,
        error: data?.error?.message || `Lỗi đọc chỉ số Facebook (${res.status})`,
      };
    }
    const likes = data.reactions?.summary?.total_count || 0;
    const comments = data.comments?.summary?.total_count || 0;
    const shares = data.shares?.count || 0;
    return { ok: true, likes, comments, shares };
  } catch (err: any) {
    return { ok: false, likes: 0, comments: 0, shares: 0, error: err?.message || String(err) };
  }
}

export async function getInstagramMediaMetrics(
  mediaId: string,
  accessToken: string,
): Promise<PostMetricsResult> {
  if (!mediaId || !accessToken) {
    return { ok: false, likes: 0, comments: 0, shares: 0, error: "Thiếu Media ID hoặc Access Token" };
  }
  const cleanId = mediaId.trim();
  const cleanToken = accessToken.trim();
  const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}?fields=like_count,comments_count,insights.metric(reach)&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        likes: 0,
        comments: 0,
        shares: 0,
        error: data?.error?.message || `Lỗi đọc chỉ số Instagram (${res.status})`,
      };
    }
    const likes = data.like_count || 0;
    const comments = data.comments_count || 0;
    let reach: number | undefined;
    if (Array.isArray(data.insights?.data) && data.insights.data[0]?.values?.[0]?.value) {
      reach = data.insights.data[0].values[0].value;
    }
    return { ok: true, likes, comments, shares: 0, reach };
  } catch (err: any) {
    return { ok: false, likes: 0, comments: 0, shares: 0, error: err?.message || String(err) };
  }
}

/**
 * 2. QUẢN LÝ BÌNH LUẬN (Comments: Read & Reply)
 */
export async function getPostComments(
  postId: string,
  accessToken: string,
  isInstagram: boolean = false,
): Promise<{ ok: boolean; comments: CommentItem[]; error?: string }> {
  const cleanId = postId.trim();
  const cleanToken = accessToken.trim();
  const fields = isInstagram
    ? "id,text,timestamp,username,like_count"
    : "id,message,created_time,from,like_count,user_likes";
  const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/comments?fields=${fields}&limit=50&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        comments: [],
        error: data?.error?.message || `Lỗi tải bình luận (${res.status})`,
      };
    }
    const raw = Array.isArray(data.data) ? data.data : [];
    const comments: CommentItem[] = raw.map((c: any) => ({
      id: c.id,
      from: isInstagram
        ? { id: "", name: c.username || "Instagram User" }
        : c.from ? { id: c.from.id, name: c.from.name } : undefined,
      text: c.message || c.text || "",
      created_time: c.created_time || c.timestamp || new Date().toISOString(),
      like_count: c.like_count || 0,
      user_likes: Boolean(c.user_likes),
    }));
    return { ok: true, comments };
  } catch (err: any) {
    return { ok: false, comments: [], error: err?.message || String(err) };
  }
}

export async function replyToComment(
  commentId: string,
  accessToken: string,
  message: string,
  isInstagram: boolean = false,
): Promise<{ ok: boolean; replyId?: string; error?: string }> {
  const cleanId = commentId.trim();
  const cleanToken = accessToken.trim();
  const endpoint = isInstagram
    ? `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/replies`
    : `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/comments`;

  const body = new URLSearchParams();
  body.set(isInstagram ? "message" : "message", message);
  body.set("access_token", cleanToken);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data: any = await res.json();
    if (!res.ok || data.error || !data.id) {
      return {
        ok: false,
        error: data?.error?.message || `Lỗi gửi phản hồi bình luận (${res.status})`,
      };
    }
    return { ok: true, replyId: data.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * 3. QUẢN LÝ TIN NHẮN (Inbox: Conversations & Messages)
 */
export async function getConversationsList(
  pageIdOrIgId: string,
  accessToken: string,
  isInstagram: boolean = false,
): Promise<{ ok: boolean; conversations: ConversationItem[]; error?: string }> {
  const cleanId = pageIdOrIgId.trim();
  const cleanToken = accessToken.trim();
  const platformParam = isInstagram ? "&platform=instagram" : "";
  const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/conversations?fields=id,snippet,updated_time,unread_count,participants&limit=30${platformParam}&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        conversations: [],
        error: data?.error?.message || `Lỗi tải danh sách hội thoại (${res.status})`,
      };
    }
    const raw = Array.isArray(data.data) ? data.data : [];
    const conversations: ConversationItem[] = raw.map((c: any) => ({
      id: c.id,
      snippet: c.snippet || "",
      updated_time: c.updated_time || new Date().toISOString(),
      unread_count: c.unread_count || 0,
      participants: Array.isArray(c.participants?.data)
        ? c.participants.data.map((p: any) => ({ id: p.id, name: p.name, email: p.email }))
        : [],
    }));
    return { ok: true, conversations };
  } catch (err: any) {
    return { ok: false, conversations: [], error: err?.message || String(err) };
  }
}

export async function getConversationMessages(
  conversationId: string,
  accessToken: string,
): Promise<{ ok: boolean; messages: MessageItem[]; error?: string }> {
  const cleanId = conversationId.trim();
  const cleanToken = accessToken.trim();
  const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/messages?fields=id,message,created_time,from&limit=50&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        messages: [],
        error: data?.error?.message || `Lỗi tải tin nhắn (${res.status})`,
      };
    }
    const raw = Array.isArray(data.data) ? data.data : [];
    const messages: MessageItem[] = raw.map((m: any) => ({
      id: m.id,
      text: m.message || "",
      created_time: m.created_time || new Date().toISOString(),
      from: m.from ? { id: m.from.id, name: m.from.name, email: m.from.email } : { id: "", name: "User" },
    }));
    return { ok: true, messages };
  } catch (err: any) {
    return { ok: false, messages: [], error: err?.message || String(err) };
  }
}

export async function sendDirectMessage(
  pageIdOrIgId: string,
  recipientId: string,
  accessToken: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const cleanId = pageIdOrIgId.trim();
  const cleanToken = accessToken.trim();
  const endpoint = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/messages`;

  const body = {
    recipient: { id: recipientId.trim() },
    message: { text: text.trim() },
    messaging_type: "RESPONSE",
  };

  try {
    const res = await fetch(`${endpoint}?access_token=${encodeURIComponent(cleanToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    if (!res.ok || data.error || !data.message_id) {
      return {
        ok: false,
        error: data?.error?.message || `Lỗi gửi tin nhắn (${res.status})`,
      };
    }
    return { ok: true, messageId: data.message_id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}



export async function getRecentPosts(
  targetId: string,
  accessToken: string,
  isInstagram: boolean = false,
): Promise<{ ok: boolean; posts: RecentPostItem[]; error?: string }> {
  if (!targetId || !accessToken) {
    return { ok: false, posts: [], error: "Thiếu Target ID hoặc Access Token" };
  }
  const cleanId = targetId.trim();
  const cleanToken = accessToken.trim();
  const url = isInstagram
    ? `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/media?fields=id,caption,timestamp,permalink,comments_count,like_count&limit=25&access_token=${encodeURIComponent(cleanToken)}`
    : `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanId)}/feed?fields=id,message,created_time,permalink_url,comments.summary(true).limit(0),reactions.summary(true).limit(0)&limit=25&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        posts: [],
        error: data?.error?.message || `Lỗi tải bài viết gần đây (${res.status})`,
      };
    }
    const raw = Array.isArray(data.data) ? data.data : [];
    const posts: RecentPostItem[] = raw.map((p: any) => ({
      id: p.id,
      message: p.caption || p.message || "(Không có nội dung)",
      created_time: p.timestamp || p.created_time || new Date().toISOString(),
      permalink: p.permalink || p.permalink_url || "",
      comments_count: p.comments_count ?? p.comments?.summary?.total_count ?? 0,
      likes_count: p.like_count ?? p.reactions?.summary?.total_count ?? 0,
    }));
    return { ok: true, posts };
  } catch (err: any) {
    return { ok: false, posts: [], error: err?.message || String(err) };
  }
}
