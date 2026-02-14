# Icon Generation Script
# Run this script to generate PNG icons from the SVG source

# Requires: ImageMagick (convert command) or Inkscape

# Using ImageMagick:
# convert -background none icons/icon.svg -resize 16x16 icons/icon-16.png
# convert -background none icons/icon.svg -resize 32x32 icons/icon-32.png
# convert -background none icons/icon.svg -resize 48x48 icons/icon-48.png
# convert -background none icons/icon.svg -resize 96x96 icons/icon-96.png
# convert -background none icons/icon.svg -resize 128x128 icons/icon-128.png

# Using Inkscape:
# inkscape -w 16 -h 16 icons/icon.svg -o icons/icon-16.png
# inkscape -w 32 -h 32 icons/icon.svg -o icons/icon-32.png
# inkscape -w 48 -h 48 icons/icon.svg -o icons/icon-48.png
# inkscape -w 96 -h 96 icons/icon.svg -o icons/icon-96.png
# inkscape -w 128 -h 128 icons/icon.svg -o icons/icon-128.png

# Or use an online SVG to PNG converter:
# https://svgtopng.com/
# https://cloudconvert.com/svg-to-png

echo "Creating placeholder PNG files..."

# For development, you can use simple colored squares as placeholders
# These should be replaced with proper icons before publishing

for size in 16 32 48 96 128; do
  if command -v convert &> /dev/null; then
    convert -background none icons/icon.svg -resize ${size}x${size} icons/icon-${size}.png
    echo "Created icon-${size}.png"
  else
    echo "ImageMagick not found. Please install it or manually convert icons/icon.svg to PNG files."
    break
  fi
done

echo "Done!"
