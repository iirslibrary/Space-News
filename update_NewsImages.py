import datetime
import json
import os
import requests
from bs4 import BeautifulSoup

# 1. Automatically get today's date in YYYY-MM-DD format (e.g., '2026-08-07')
today_str = datetime.date.today().strftime("%Y-%m-%d")

# 2. Build the path inside the 'snapshots' folder
SNAPSHOT_DIR = "snapshots"
SNAPSHOT_FILE = os.path.join(SNAPSHOT_DIR, f"{today_str}.json")


def update_snapshot_images():
  if not os.path.exists(SNAPSHOT_FILE):
    print(f"Error: Today's snapshot file '{SNAPSHOT_FILE}' not found.")
    return

  # Load the snapshot JSON file for today
  with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
    news_list = json.load(f)

  isro_fallback = "./assets/ISRO_default.webp"
  nasa_fallback = "./assets/NASA_default.jpg"
  general_fallback = "./assets/general_default.png"

  headers = {
      "User-Agent": (
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          " (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
  }

  updated_count = 0

  for item in news_list:
    # Check if the image field is missing, empty, or null
    if not item.get("image"):
      article_url = item.get("link")
      fetched_image = None

      if article_url:
        try:
          print(f"Checking: {item['title'][:40]}...")
          response = requests.get(article_url, headers=headers, timeout=8)
          if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")

            # Try OpenGraph image tag first
            og_image = soup.find("meta", property="og:image")
            if og_image and og_image.get("content"):
              fetched_image = og_image["content"]
            else:
              # Fallback to Twitter image tag
              twitter_image = soup.find("meta", name="twitter:image")
              if twitter_image and twitter_image.get("content"):
                fetched_image = twitter_image["content"]
        except Exception as e:
          print(f"  -> Skipped scraping due to error: {e}")

      # Assign scraped image or apply smart fallback
      if fetched_image:
        item["image"] = fetched_image
        print("  -> Successfully scraped image!")
        updated_count += 1
      else:
        source_text = item.get("source", "").lower()
        if "isro" in source_text or "iirs" in source_text or "nrsc" in source_text:
          item["image"] = isro_fallback
        elif "nasa" in source_text:
          item["image"] = nasa_fallback
        else:
          item["image"] = general_fallback
        print("  -> Applied smart fallback image.")
        updated_count += 1

  # Save the updated snapshot back to disk if changes were made
  if updated_count > 0:
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
      json.dump(news_list, f, indent=2, ensure_ascii=False)
    print(
        f"\nSuccessfully updated {updated_count} items in '{SNAPSHOT_FILE}'."
    )
  else:
    print("\nNo missing images found. Snapshot is already up to date.")


if __name__ == "__main__":
  update_snapshot_images()
