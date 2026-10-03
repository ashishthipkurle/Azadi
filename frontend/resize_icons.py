from PIL import Image

def pad_to_square(img_path):
    img = Image.open(img_path)
    w, h = img.size
    scale = min(1024/w, 1024/h)
    new_w, new_h = int(w*scale), int(h*scale)
    
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    new_img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    new_img.paste(img, ((1024-new_w)//2, (1024-new_h)//2))
    new_img.save(img_path)
    print(f"Resized {img_path} to 1024x1024")

pad_to_square("assets/images/icon.png")
pad_to_square("assets/images/adaptive-icon.png")
