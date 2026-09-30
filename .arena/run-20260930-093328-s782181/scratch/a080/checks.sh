#!/bin/bash
# Pass/fail checks for mail 1 (subject + preheader + body), written before the answer.
F="$1"
m1=$(awk '/^<!-- M1 START -->/{f=1;next}/^<!-- M1 END -->/{f=0}f' "$F")
rl=$(awk '/^<!-- R START -->/{f=1;next}/^<!-- R END -->/{f=0}f' "$F")
fail=0
chk(){ if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
# C1 promo / urgency / superlative vocabulary absent from mail 1
chk C1_vocab '! echo "$m1" | grep -iqE "offert|offre|exclusi|gratuit|aujourd|profite|bénéfici|promo|remise|prestige|excellence|exception|irréprochable|plus belles|meilleur|unique|garanti|urgent|dernier|vite|découvr|cliquez"'
# C2 no price / currency symbol in mail 1
chk C2_price '! echo "$m1" | grep -qE "€|euro|[0-9]{3}"'
# C3 no link in mail 1
chk C3_nolink '! echo "$m1" | grep -qiE "http|www\.|\.com"'
# C4 no exclamation, max one question mark, no words in caps (>=4 letters)
chk C4_punct '! echo "$m1" | grep -q "!" && [ $(echo "$m1" | grep -o "?" | wc -l) -le 1 ] && ! echo "$m1" | grep -qE "\b[A-ZÉÈ]{4,}\b"'
# C5 greeting Maître, vouvoiement (no tu/te/ton/ta/tes)
chk C5_ton 'echo "$m1" | grep -q "^Maître," && ! echo "$m1" | grep -qiwE "tu|toi|ton|ta|tes"'
# C6 unsubscribe line
chk C6_unsub 'echo "$m1" | grep -qi "ne plus recevoir"'
# C7 body length <= 130 words (whole mail-1 block incl. subject lines)
n=$(echo "$m1" | wc -w); echo "   mail1 words: $n"; chk C7_len '[ $n -le 150 ]'
# C8 single CTA mentioning 10 minutes
chk C8_cta '[ $(echo "$m1" | grep -o "10 minutes" | wc -l) -eq 1 ]'
# C9 relance: exactly one URL, no € symbol, no offert/offre/gratuit
chk C9_relance '[ $(echo "$rl" | grep -o "https://" | wc -l) -eq 1 ] && ! echo "$rl" | grep -qE "€" && ! echo "$rl" | grep -iqE "offert|offre|gratuit|exclusi"'
# C10 no numeric spam score or guarantee anywhere
chk C10_noscore '! grep -iqE "score (de|anti)[^.]*[0-9]|/10|garantit|garantie de délivrabilité|100 ?%" "$F"'
exit $fail
