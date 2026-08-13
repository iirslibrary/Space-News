import asyncio
import json
import os
import nest_asyncio
from browser_use import Agent, ChatGoogle  # type: ignore

# Apply nest_asyncio for smooth async event loop handling in GitHub Actions
nest_asyncio.apply()

# CRITICAL FIX: Ensure browser-use's ChatGoogle can find the API key from GitHub Secrets
if "GOOGLE_API_KEY" not in os.environ and "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
    print("🔑 Mapped GEMINI_API_KEY to GOOGLE_API_KEY for the browser agent.")

async def find_image_with_browser_agent(article_url):
    # Using the active gemini-3.5-flash model
    llm = ChatGoogle(model="gemini-3.5-flash")
    
    task = (
        f"Go to this URL: {article_url}\n"
        "Look at the main news article. Find the primary header image or hero image of the article. "
        "Extract the direct image source URL (ending in .jpg, .png, .webp, etc.). "
        "Return ONLY the raw image URL string as your final answer."
    )
    
    agent = Agent(task=task, llm=llm)
    result = await agent.run()
    
    if result and result.final_result():
        return result.final_result().strip()
    return None

async def main():
    snapshots_dir = 'snapshots'
    
    if not os.path.exists(snapshots_dir):
        print("❌ Error: 'snapshots' directory not found in the repository root.")
        return

    # Automatically target today's snapshot file or the latest modified JSON file
    snapshot_date = os.environ.get('SNAPSHOT_DATE', '').strip()
    if snapshot_date:
        json_path = os.path.join(snapshots_dir, f"{snapshot_date}.json")
    else:
        json_files = [os.path.join(snapshots_dir, f) for f in os.listdir(snapshots_dir) if f.endswith('.json')]
        if not json_files:
            print("❌ Error: No JSON snapshot files found inside the snapshots directory.")
            return
        json_path = max(json_files, key=os.path.getmtime)

    print(f"🎯 Targeting snapshot file: {json_path}")

    if not os.path.exists(json_path):
        print(f"❌ Error: Snapshot file {json_path} does not exist.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        news_data = json.load(f)

    updated_count = 0

    for index, item in enumerate(news_data):
        article_url = item.get('link')
        current_image = item.get('image')
        
        if article_url:
            print(f"\n[Agent Working] Inspecting article {index + 1} of {len(news_data)}: {item.get('title')}")
            print(f"Target Link: {article_url}")
            
            try:
                img_url = await find_image_with_browser_agent(article_url)
                
                if img_url and img_url.startswith('http'):
                    if current_image != img_url:
                        item['image'] = img_url
                        updated_count += 1
                        print(f"✅ [Success] Agent extracted/updated image -> {img_url}")
                    else:
                        print("ℹ️ [Info] Image is already up to date.")
                else:
                    print("⚠️ [Warning] Agent could not locate a clean image link.")
            except Exception as e:
                print(f"❌ [Error] Agent failed for this article: {e}")

    # Write changes back to the snapshot JSON file
    if updated_count > 0:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(news_data, f, indent=2, ensure_ascii=False)
        print(f"\n🎉 Successfully updated {updated_count} image(s) in {json_path}!")
    else:
        print("\n⚠️ No updates were applied. Check logs above for any agent exceptions.")

if __name__ == '__main__':
    asyncio.run(main())
