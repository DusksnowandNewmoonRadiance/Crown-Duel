import json,urllib.request,sys,os
os.makedirs(r".tmp\dl",exist_ok=True)
url="https://pypi.org/pypi/soundfile/json"
j=json.load(urllib.request.urlopen(url,timeout=60))
f=[u for u in j["urls"] if u["filename"].endswith("win_amd64.whl")][0]
print(f["filename"], f["size"])
urllib.request.urlretrieve(f["url"], r".tmp\dl\sf.zip")
print("ok", os.path.getsize(r".tmp\dl\sf.zip"))
