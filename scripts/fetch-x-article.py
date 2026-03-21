#!/usr/bin/env python3
"""Fetch an X Article with embedded images via twitter-cli's GraphQL client.

Usage: python3 scripts/fetch-x-article.py <tweet_id>

Outputs JSON: { "ok": true, "title": "...", "text": "...(markdown with images)...", "images": [...] }
Requires: TWITTER_AUTH_TOKEN + TWITTER_CT0 env vars (or browser cookies).
"""
import json
import os
import sys


def _deep_get(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def fetch_article_with_images(tweet_id: str) -> dict:
    from twitter_cli.client import TwitterClient

    auth_token = os.environ.get("TWITTER_AUTH_TOKEN", "")
    ct0 = os.environ.get("TWITTER_CT0", "")
    c = TwitterClient(auth_token=auth_token, ct0=ct0)

    data = c._graphql_get(
        "TweetResultByRestId",
        variables={
            "tweetId": tweet_id,
            "withCommunity": False,
            "includePromotedContent": False,
            "withVoice": False,
        },
        features={
            "longform_notetweets_consumption_enabled": True,
            "responsive_web_twitter_article_tweet_consumption_enabled": True,
            "longform_notetweets_rich_text_read_enabled": True,
            "longform_notetweets_inline_media_enabled": True,
            "articles_preview_enabled": True,
            "responsive_web_graphql_exclude_directive_enabled": True,
            "verified_phone_label_enabled": False,
        },
        field_toggles={
            "withArticleRichContentState": True,
            "withArticlePlainText": True,
        },
    )

    result = _deep_get(data, "data", "tweetResult", "result")
    if not result:
        return {"ok": False, "error": "Tweet not found"}

    article = _deep_get(result, "article", "article_results", "result")
    if not article:
        return {"ok": False, "error": "No article content"}

    title = article.get("title", "")
    content_state = article.get("content_state", {})
    blocks = content_state.get("blocks", [])
    if not blocks:
        return {"ok": False, "error": "Empty article"}

    # Build media_id -> image URL map from media_entities + cover_media
    media_url_map: dict[str, str] = {}
    candidates = list(article.get("media_entities", []))
    if article.get("cover_media"):
        candidates.append(article["cover_media"])

    for me in candidates:
        if not isinstance(me, dict):
            continue
        mi = me.get("media_info", {})
        url = mi.get("original_img_url")
        if not url:
            preview = mi.get("preview_image", {})
            url = preview.get("original_img_url")
        mid = me.get("media_id")
        if url and mid:
            media_url_map[str(mid)] = url

    # Normalize entityMap (may be dict or [{key, value}, ...])
    raw_em = content_state.get("entityMap", {})
    entity_map: dict[str, dict] = {}
    if isinstance(raw_em, list):
        for item in raw_em:
            if isinstance(item, dict) and "key" in item and "value" in item:
                entity_map[str(item["key"])] = item["value"]
    elif isinstance(raw_em, dict):
        entity_map = {str(k): v for k, v in raw_em.items()}

    # Convert Draft.js blocks to Markdown with images
    parts: list[str] = []
    images: list[str] = []
    ordered_counter = 0

    for block in blocks:
        block_type = block.get("type", "unstyled")

        if block_type == "atomic":
            ordered_counter = 0
            for er in block.get("entityRanges", []):
                ek = er.get("key")
                entity = entity_map.get(str(ek)) if ek is not None else None
                if not isinstance(entity, dict):
                    continue
                etype = (entity.get("type") or "").upper()
                if etype == "MEDIA":
                    for mi in _deep_get(entity, "data", "mediaItems") or []:
                        mid = mi.get("mediaId") if isinstance(mi, dict) else None
                        img_url = media_url_map.get(str(mid)) if mid else None
                        if img_url:
                            parts.append(f"![]({img_url})")
                            images.append(img_url)
                elif etype == "MARKDOWN":
                    md = _deep_get(entity, "data", "markdown")
                    if isinstance(md, str) and md.strip():
                        parts.append(md.strip())
                # TWEET, DIVIDER etc. — skip
            continue

        text = block.get("text", "")
        if not text:
            continue

        if block_type != "ordered-list-item":
            ordered_counter = 0

        if block_type == "header-one":
            parts.append(f"# {text}")
        elif block_type == "header-two":
            parts.append(f"## {text}")
        elif block_type == "header-three":
            parts.append(f"### {text}")
        elif block_type == "blockquote":
            parts.append(f"> {text}")
        elif block_type == "unordered-list-item":
            parts.append(f"- {text}")
        elif block_type == "ordered-list-item":
            ordered_counter += 1
            parts.append(f"{ordered_counter}. {text}")
        elif block_type == "code-block":
            parts.append(f"```\n{text}\n```")
        else:
            parts.append(text)

    return {
        "ok": True,
        "title": title,
        "text": "\n\n".join(parts),
        "images": images,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: fetch-x-article.py <tweet_id>"}))
        sys.exit(1)

    tweet_id = sys.argv[1]
    try:
        result = fetch_article_with_images(tweet_id)
    except Exception as e:
        result = {"ok": False, "error": str(e)}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
