import asyncio
import json
import os
import nest_asyncio
from browser_use import Agent, ChatGoogle  # type: ignore

# Apply nest_asyncio for smooth async event loop handling in GitHub Actions
nest_asyncio.apply()

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
        print("❌ 'snapshots' directory not found.")
        return

    # Automatically grab the most recently modified JSON file in the snapshots folder or use SNAPSHOT_DATE env
    snapshot_date = os.environ.get('SNAPSHOT_DATE', '').strip()
    if snapshot_date:
        json_path = os.path.join(snapshots_dir, f"{snapshot_date}.json")
    else:
        json_files = [os.path.join(snapshots_dir, f) for f in os.listdir(snapshots_dir) if f.endswith('.json')]
        if not json_files:
            print("❌ No JSON snapshot files found in the snapshots directory.")
            return
        json_path = max(json_files, key=os.path.getmtime)

    print(f"🎯 Targeting snapshot file: {json_path}")

    if not os.path.exists(json_path):
        print(f"❌ Snapshot file {json_path} not found.")
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
                    # Update if the image is different or previously null/missing
                    if current_image != img_url:
                        item['image'] = img_url
                        updated_count += 1
                        print(f"[Success] Agent extracted/updated image -> {img_url}")
                    else:
                        print("[Info] Image is already up to date.")
                else:
                    print("[Warning] Agent could not locate a clean image link.")
            except Exception as e:
                print(f"[Error] Agent failed: {e}")

    # Write changes back to the snapshot JSON file
    if updated_count > 0:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(news_data, f, indent=2, ensure_ascii=False)
        print(f"\nSuccessfully updated {updated_count} image(s) in {json_path}!")
    else:
        print("\nNo updates were applied. All images were already current.")

if __name__ == '__main__':
    asyncio.run(main())
