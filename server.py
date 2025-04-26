import os
import cv2
import numpy as np
import torch
import onnxruntime as ort
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from PIL import Image
from flask_cors import CORS
import time


app = Flask(__name__)

# Enable CORS (Cross-Origin Resource Sharing) for all routes
CORS(app)

# Define constants
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'mp4', 'avi'}
MODEL_PATH = 'model_converted (3).onnx'  # Path to your ONNX model

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Load the ONNX model
session = ort.InferenceSession(MODEL_PATH)

# Check if the file has an allowed extension
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Function to process image dehazing
def dehaze_image(image_path):
    start_time = time.time()
    image = load_image(image_path)
    original_size = Image.open(image_path).convert('RGB').size
    inputs=preprocess(image)
    outputs = session.run(None, inputs)
    dehazed_image = tensor_to_image(outputs[0])
    dehazed_image_resized = Image.fromarray((dehazed_image * 255).astype(np.uint8))
    dehazed_image_resized = dehazed_image_resized.resize(original_size, Image.LANCZOS)  # Resize to original size
    result_image_path = os.path.join(UPLOAD_FOLDER, 'dehazed_image.png')
    dehazed_image_resized.save(result_image_path)
    total_time = time.time() - start_time
    print(f"Total time taken: {total_time:.2f} seconds")
    return result_image_path

@app.route('/dehaze-image', methods=['POST'])
def dehaze_image_api():
    if 'image' not in request.files:
        return jsonify({'error': 'No image part'}), 400

    file = request.files['image']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file format'}), 400

    filename = secure_filename(file.filename)
    image_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(image_path)

    dehazed_image_path = dehaze_image(image_path)
    return jsonify({'image_path': 'dehazed_image.png'})

def dehaze_video(video_path):
    start_time = time.time()
    cap = cv2.VideoCapture(video_path)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    # Set output video file path
    output_video_path = os.path.join(UPLOAD_FOLDER, 'dehazed_video.mp4')
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (frame_width, frame_height))  # Use original size
    frame_counter=0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break  # Stop if frame reading failed or we've reached the end of the video
        frame_counter += 1
        if (frame_counter%10==0):
            print(f"Processing frame {frame_counter}/{total_frames}...")
        # Dehaze the frame
        dehazed_frame = dehaze_frame(frame)
        if dehazed_frame is not None:
            # Resize frame to original size before writing to output video
            dehazed_frame_resized = cv2.resize(dehazed_frame, (frame_width, frame_height))
            dehazed_frame_resized = cv2.cvtColor(dehazed_frame_resized, cv2.COLOR_RGB2BGR)
            dehazed_frame_bgr = (dehazed_frame_resized * 255).astype(np.uint8)
            out.write(dehazed_frame_bgr)  # Write dehazed frame to output video
    cap.release()  # Release the video capture
    out.release()  # Release the video writer
    total_time = time.time() - start_time
    print(f"Total time taken: {total_time:.2f} seconds")
    return output_video_path

def preprocess(img):
    dark_channel = dark_channel_prior(img)
    A = atmospheric_light(img, dark_channel)
    transmission = transmission_estimate(img, A)
    transmission_tensor = image_to_tensor(transmission)
    hazy_tensor = image_to_tensor(img)
    hazy_image_np = np.asarray(hazy_tensor.detach().numpy())
    dcp_tensor_np = np.asarray(transmission_tensor.detach().numpy())
    inputs = {
        'hazy_image': hazy_image_np,
        'dcp_features': dcp_tensor_np
    }
    return inputs

def dehaze_frame(frame):
    frame_rgb = cv2.resize(frame, (512,512))  # Resize frame before processing
    frame_rgb = cv2.cvtColor(frame_rgb, cv2.COLOR_BGR2RGB)# Convert to RGB and normalize
    frame_rgb = frame_rgb / 255.0
    inputs=preprocess(frame_rgb)

    # Run the ONNX model
    outputs = session.run(None, inputs)
    dehazed_frame = tensor_to_image(outputs[0])

    return dehazed_frame

@app.route('/delete-file', methods=['POST'])
def delete_file():
    files_to_delete = [
    "image.jpg",
    "dehazed_image.png",
    "dehazed_video.mp4",
    "video.mp4"
    ]
    for filename in files_to_delete:
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error deleting file {filename}: {e}")
    return jsonify({'message': 'Files deleted successfully'}), 200

@app.route('/dehaze-video', methods=['POST'])
def dehaze_video_api():
    if 'video' not in request.files:
        return jsonify({'error': 'No video part'}), 400

    file = request.files['video']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file format'}), 400

    filename = secure_filename(file.filename)
    video_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(video_path)

    dehazed_video_path = dehaze_video(video_path)
    return jsonify({'video_path': 'dehazed_video.mp4'})

# Preprocessing functions (same as before)
def load_image(path, size=(512,512)):
    image = Image.open(path).convert('RGB')
    image = image.resize(size, Image.LANCZOS)
    image = np.asarray(image) / 255.0
    return image

def dark_channel_prior(image, window_size=15):
    dark_channel = np.min(image, axis=2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (window_size, window_size))
    dark_channel = cv2.erode(dark_channel, kernel)
    return dark_channel

def atmospheric_light(image, dark_channel):
    num_pixels = image.shape[0] * image.shape[1]
    num_brightest = int(max(num_pixels * 0.001, 1))
    indices = np.argsort(dark_channel.ravel())[-num_brightest:]
    brightest_pixels = image.reshape(-1, 3)[indices]
    A = brightest_pixels.mean(axis=0)
    return A

def transmission_estimate(image, A, omega=0.95, window_size=15):
    norm_image = image / A
    transmission = 1 - omega * dark_channel_prior(norm_image, window_size)
    return transmission

def image_to_tensor(image):
    if len(image.shape) == 3 and image.shape[2] == 3:
        image = torch.FloatTensor(image).permute(2, 0, 1).unsqueeze(0)
    elif len(image.shape) == 2:
        image = torch.FloatTensor(image).unsqueeze(0).unsqueeze(0)
    else:
        raise ValueError("Unsupported image dimensions")
    return image

def tensor_to_image(tensor):
    if isinstance(tensor, np.ndarray):
        image = np.squeeze(tensor)
        image = np.transpose(image, (1, 2, 0))
        image = np.clip(image, 0, 1)
    else:
        image = tensor.cpu().squeeze(0).permute(1, 2, 0).detach().numpy()
        image = np.clip(image, 0, 1)
    return image

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)