#!/bin/bash
# Gera avatares das raças + shenron (banner já foi gerado)
set -e
cd /home/z/my-project/public/images

echo "Gerando avatar Saiyajin..."
z-ai image -p "Anime warrior character portrait, spiky black haired fighter wearing futuristic battle armor with shoulder pads, confident smirk, muscular build, blazing golden-orange energy aura, dramatic lighting, anime art style, vibrant colors, high quality, detailed, dark moody background" -o race-saiyajin.png -s 1024x1024

echo "Gerando avatar Humano..."
z-ai image -p "Anime martial artist character portrait, young fighter with black hair wearing orange karate gi uniform with blue belt, determined serious expression, fists clenched, warm golden aura, dramatic lighting, anime art style, vibrant colors, high quality, detailed, dark moody background" -o race-humano.png -s 1024x1024

echo "Gerando avatar Namekuseijin..."
z-ai image -p "Anime warrior character portrait, green-skinned tall fighter with antennae and pointed ears, wearing white turban and white cape, serious stoic expression, muscular, emerald green energy aura, dramatic lighting, anime art style, vibrant colors, high quality, detailed, dark moody background" -o race-namekuseijin.png -s 1024x1024

echo "Gerando avatar Androide..."
z-ai image -p "Anime android character portrait, cybernetic warrior with short blonde hair and glowing cyan robotic eyes, mechanical collar and circuit details on jacket, cold calculating stare, electric sparks aura, dramatic lighting, anime art style, vibrant colors, high quality, detailed, dark moody background" -o race-androide.png -s 1024x1024

echo "Gerando avatar Majin..."
z-ai image -p "Anime magical creature character portrait, pink-skinned round genie-like magical being with pointy ears and playful sinister grin, wearing purple vest with golden sash, swirling pink magic energy aura, dramatic lighting, anime art style, vibrant colors, high quality, detailed, dark moody background" -o race-majin.png -s 1024x1024

echo "Gerando Shenlon..."
z-ai image -p "Epic anime dragon, massive long serpentine green dragon with antlers and fierce red eyes emerging from dark storm clouds with lightning bolts, seven glowing orange crystal spheres radiating light below, dramatic composition, anime art style, high quality, detailed" -o shenron.png -s 1024x1024

echo "Pronto!"
ls -la
