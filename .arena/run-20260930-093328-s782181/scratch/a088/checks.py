import re,sys
t=open(sys.argv[1]).read()
subj=open('subj.txt').read().strip(); body=open('body.txt').read()
mail=subj+"\n"+body
low=mail.lower()
banned=["offert","offre","exclusi","gratuit","dès aujourd","aujourd'hui","cette semaine","€","prix","euro","meilleur","exception","prestige","irréprochable","excellence","plus belles","distinction","remise","promo","urgent","http","www","!","%","garanti"]
fails=[w for w in banned if w in low]
print("banned:",fails or "PASS")
caps=[w for w in re.findall(r"\b[A-ZÉÈ]{3,}\b",mail)]
print("allcaps:",caps or "PASS")
print("questions:",body.count("?"),"(want 1)")
print("vous-only(no tu):", "PASS" if not re.search(r"\b(tu|ton|ta|tes|toi)\b",low) else "FAIL")
print("unsubscribe:", "PASS" if "je ne vous écrirai plus" in low else "FAIL")
print("Maître:", "PASS" if body.startswith("Maître,") else "FAIL")
print("subj words:",len(subj.split()))
print("body words:",len(body.split()))
# facts: every factual token must be from context
for f in ["10 g","Reniala R1","Reniala System","B Corp","tables gastronomiques","10 minutes"]:
    print("fact present",f, f in body)
# body text must appear verbatim in solution
print("body in solution:", "PASS" if body.strip() in t else "FAIL")
print("url in solution:", "PASS" if "https://www.larbreacafe.com/collections/machines-et-accessoires/products/machine-a-espresso-reniala?variant=52934046875975" in t else "FAIL")
