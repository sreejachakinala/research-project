import React, { useState, useEffect, useRef } from 'react';
import { View, Button, Image, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, TouchableOpacity,Modal,ImageBackground} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoPicker from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import { Video } from 'expo-av';
import { shareAsync } from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

export default function App() {
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaType, setMediaType] = useState(null); 
  const [resultUri, setResultUri] = useState(null); 
  const [imageAspectRatio, setImageAspectRatio] = useState(1); 
  const [loading, setLoading] = useState(false);     
  const videoRef = useRef(null); 
  const [isModalVisible, setModalVisible] = useState(false);
  const [isResModalVisible,setResModalVisible]=useState(false);
  const [hasMediaLibraryPermission, setHasMediaLibraryPermission] = useState();

  const showMediaTypeModal = (type) => {
    setMediaType(type); // Set whether it's 'imcdage' or 'video'
    setModalVisible(true); // Show the modal
  };
  // Function to choose between gallery or camera
  const chooseMediaSource = (source) => {
    if (source === 'gallery') {
      mediaType === 'image' ? pickImageFromGallery() : pickVideoFromGallery();
    } else if (source === 'camera') {
      mediaType === 'image' ? captureImage() : captureVideo();
    }
    setModalVisible(false); // Close the modal after selection
  };
  // Request necessary permissions for media and camera
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    const videoStatus = await VideoPicker.requestPermissionsAsync();
    const mediaLibraryPermission = await MediaLibrary.requestPermissionsAsync();
  
    if (status !== 'granted' || cameraStatus !== 'granted' || videoStatus.status !== 'granted') {
      Alert.alert('Permission Required', 'Permission to access gallery or camera is required!');
    }
  };
  
  useEffect(() => {
    requestPermissions();
  }, []);

  // Pick an image from the gallery
  const pickImageFromGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing:true,
      quality: 1, 
    });
    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setMediaType('image');
      getImageAspectRatio(result.assets[0].uri);  
      uploadMedia(result.assets[0].uri, 'image');
    } else {
      Alert.alert('No Image Selected', 'Please select an image to proceed.');
    }
  };

  const getImageAspectRatio = async (uri) => {
    const { width, height } = await new Promise((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
    setImageAspectRatio(width / height);
  };
  

  // Pick a video from the gallery
  const pickVideoFromGallery = async () => {
    let videoResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, 
      allowsEditing:true,
    });

    if (!videoResult.canceled) {
      setMediaUri(videoResult.assets[0].uri);
      setMediaType('video');
      uploadMedia(videoResult.assets[0].uri, 'video');
    } else {
      Alert.alert('No Video Selected', 'Please select a video to proceed.');
    }
  };

  // Capture image using camera
  const captureImage = async () => {
    let result = await ImagePicker.launchCameraAsync({
      quality: 1, 
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setMediaType('image');
      getImageAspectRatio(result.assets[0].uri);  
      uploadMedia(result.assets[0].uri, 'image');
    } else {
      Alert.alert('No Image Captured', 'Please capture an image to proceed.');
    }
  };
  const captureVideo = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,  // Only capture videos
      quality: 1,  // Highest video quality
      videoStabilization: true,  // Optional: enable stabilization
    });
    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);  // Store the video URI
      setMediaType('video');  // Set the media type as video
      uploadMedia(result.assets[0].uri, 'video');
    } else {
      Alert.alert('No Video Captured', 'Please capture a video to proceed.');
    }
  };
  // Upload media (image or video)
  const uploadMedia = async (uri, type) => {
    setLoading(true); 
    setResModalVisible(true);
    setResultUri(null); 

    try {
      const formData = new FormData();
      formData.append(type, {
        uri,
        name: type === 'image' ? 'image.jpg' : 'video.mp4',
        type: type === 'image' ? 'image/jpeg' : 'video/mp4',
      });

      const response = await axios.post('http://10.108.221.61:8000/dehaze-' + type, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.image_path || response.data.video_path) {
        const timestamp = new Date().getTime(); 
        setResultUri('http://10.108.221.61:8000/uploads/' + (response.data.image_path || response.data.video_path) + `?t=${timestamp}`);
      } else {
        Alert.alert('Error', 'No processed media path returned');
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      Alert.alert('Error', error.response?.data?.message || 'There was a problem uploading the media. Please try again later.');
    } finally {
      setLoading(false); 
    }
  };
  const savePhoto = async (url) => {
    try{
    MediaLibrary.saveToLibraryAsync(url);
    }
    catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert('Error', 'Could not save the media to gallery');
    }
  }
  const savePhoto1 = async (url) => {
    try {
      if (!url) {
        Alert.alert('Error', 'No media to save');
        console.log('Saved to gallery:', asset);
        Alert.alert('Success', 'Media saved to gallery.');
      }
      // Determine file extension based on media type (image or video)
      const fileExtension = mediaType === 'image' ? '.jpg' : '.mp4';
      const localUri = FileSystem.documentDirectory + 'tempfile' + fileExtension;
      // Download the file to local storage
      await FileSystem.downloadAsync(url, localUri);
      console.log('Downloaded to', localUri);
      // Save the downloaded file to the gallery
      let asset;
      if (mediaType === 'image') {
        asset = await MediaLibrary.saveToLibraryAsync(localUri);  // Saving image
      } else if (mediaType === 'video') {
        asset = await MediaLibrary.saveToLibraryAsync(localUri);  // Saving video
      }
      console.log('Saved to gallery:', asset);
      Alert.alert('Success', 'Media saved to gallery.');
    } catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert('Error', 'Could not save the media to gallery');
    }
  };
  const sharePic = async (url) => {
    shareAsync(url);
    };
    const sharePic1 = async (url)=>{
      const fileExtension = mediaType === 'image' ? '.jpg' : '.mp4';
      const localUri = FileSystem.documentDirectory + 'tempfile' + fileExtension;
      // Download the file to local storage
      await FileSystem.downloadAsync(url, localUri);
      console.log('Downloaded to', localUri);
      shareAsync(localUri);
    };
  const deleteMediaFile = async () => {
    try {
      if (mediaUri) {
        console.log("Deleting mediaUri:", mediaUri);
        // Send a request to delete the file from the backend
        await axios.post('http://10.108.221.61:8000/delete-file', { uri: mediaUri });
        console.log('File successfully deleted from server.');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setResModalVisible(false); // Close the result modal after deletion
    }
  };  
  return (
    <ImageBackground
      source={require('./assets/BIMG.jpg')}  // Path to your background image
      style={styles.background}
    >
      <View style={styles.container}>
        <Text style={styles.header}>Dehaze</Text>

      {/* Button to choose Image */}
      <TouchableOpacity style={styles.button} onPress={() => showMediaTypeModal('image')}>
        <Text style={styles.buttonText}>Image</Text>
      </TouchableOpacity>
      {/* Button to choose Video */}
      <TouchableOpacity style={styles.button} onPress={() => showMediaTypeModal('video')}>
        <Text style={styles.buttonText}>Video</Text>
      </TouchableOpacity>
      {/* Modal that asks for Gallery or Camera selection */}
      {isModalVisible && (
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => deleteMediaFile()} // Close modal when pressing back button on Android
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalHeader}>Select Media Source</Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => chooseMediaSource('gallery')}
              >
                <Text style={styles.modalButtonText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => chooseMediaSource('camera')}
              >
                <Text style={styles.modalButtonText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: 'white',marginBottom:0,marginTop:0,paddingTop:5,paddingBottom:5}]} onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalButtonText, { color:'black' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {isResModalVisible && (
        <>
        <Modal
        visible={isResModalVisible}
        transparent={true}
          animationType="slide"
          onRequestClose={() => deleteMediaFile()}>
            <ImageBackground
                source={require('./assets/BIMG.jpg')}  // Path to your background image
                style={styles.background}
              >
            <View style={styles.resModalOverlay}>
            <View style={styles.resModalContent}>
            <ScrollView contentContainerStyle={styles.scrollContainer}>
              {/* Display picked image */}
              {mediaUri && mediaType === 'image' && (
                <>
                <Image source={{ uri: mediaUri }} style={[styles.mediaPreview, { aspectRatio: imageAspectRatio }]} />
                <View style={styles.saveButtonContainer}>
                <TouchableOpacity style={[styles.saveButton, {marginRight:25 }]} onPress={() => savePhoto(mediaUri)}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={() => sharePic(mediaUri)}>
                  <Text style={styles.saveButtonText}>Share</Text>
                </TouchableOpacity>
                </View>
                </>
              )}
              {/* Display result after processing (image) */}
              {resultUri && mediaType === 'image' && !loading && (
                <>
                <Image source={{ uri: resultUri }} style={[styles.mediaPreview, { aspectRatio: imageAspectRatio }]}/>
                <View style={styles.saveButtonContainer}>
                <TouchableOpacity style={[styles.saveButton, {marginRight:25 }]} onPress={() => savePhoto1(resultUri)}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={() => sharePic1(resultUri)}>
                  <Text style={styles.saveButtonText}>Share</Text>
                </TouchableOpacity>
                </View>
                </>
              )}
              {/* Display picked video */}
              {mediaUri && mediaType === 'video' && (
                <>
                <View style={styles.videoContainer}>
                <Video
                  source={{ uri: mediaUri }}
                  style={styles.video}
                  useNativeControls
                  resizeMode="contain"
                />
                </View>
                <View style={styles.saveButtonContainer}>
                <TouchableOpacity style={[styles.saveButton, {marginRight:25 }]} onPress={() => savePhoto(mediaUri)}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity> 
                <TouchableOpacity style={styles.saveButton} onPress={() => sharePic(mediaUri)}>
                  <Text style={styles.saveButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
              </>
              )}
              {/* Display result after processing (video) */}
              {resultUri && mediaType === 'video' && (
                <>
                <View style={styles.videoContainer}>
                <Video
                  source={{ uri: resultUri }}
                  style={styles.video}
                  useNativeControls
                  resizeMode="contain"
                />
                </View>
                <View style={styles.saveButtonContainer}>
                <TouchableOpacity style={[styles.saveButton, {marginRight:25 }]} onPress={() => savePhoto1(resultUri)}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={() => sharePic1(resultUri)}>
                  <Text style={styles.saveButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
              </>
              )}
              {/* Loading Indicator */}
              {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.loading} />}
              </ScrollView>
            </View>
          </View>
          </ImageBackground>
        </Modal>
        
        </>
      )}
      </View>
    </ImageBackground>
  );
};
const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1, 
    paddingBottom: 20, 
    alignItems:'center' ,
    justifyContent:'center'
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start', 
    alignItems: 'center',
    // padding: 16,
    marginBottom:0,
    // backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 255,
    marginBottom:60,
    textAlign: 'center',      
    fontFamily: 'Arial',
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop:10,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Adjust to your desired background color
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom:15,
    paddingHorizontal: 15,
    alignSelf:'flex-end',
    // width: '25%', // Adjust as necessary
  },
  saveButtonText: {
    color: '#000', // Text color
    fontSize: 12,
    fontWeight: 'bold',
  },  
  videoContainer: {
    marginTop: 20,
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    
  },
  video: {
    width: '100%',
    height: '100%',
  },
  button: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    width: 170, // Fixed width of button
    paddingHorizontal: 30,
    borderRadius: 8,
    marginBottom: 40,
    justifyContent: 'center', // Center content horizontally
    alignItems: 'center', // Center content vertically
    flexDirection: 'row', // Ensure content is aligned in a row (even though we only have one text)
  },
  buttonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center', // Ensure the text is aligned in the center
    width: '100%', // Make sure the text takes up the full width of the button
  },  
  saveButtonContainer: {
    flexDirection: 'row', // Make buttons appear side by side
    justifyContent: 'flex-end', // Space between the buttons
    width: '100%', // Adjust the width of the container to fit both buttons
    alignItems: 'right', // Vertically align the buttons
    marginTop: 10, // Add some space between the buttons and media preview
  },
  mediaPreview: {
    width: '100%',
    marginTop: 15,
    marginBottom:3,
    backgroundColor: '#e0e0e0',
    borderRadius:2
  },
  loading: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)', // Semi-transparent overlay
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    width: '80%', // Adjust the width of the modal as needed
  },
  resModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff', 
  },
  resModalContent: {
    padding: 20,
    flex:1,
    justifyContent:'center',
    borderRadius: 10,
    alignItems: 'center',
    width: '95%', // Adjust the width of the modal as needed
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 25,
    marginTop:15
  },
  modalButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginBottom: 10,
    width: '70%', // Ensure buttons take full width inside the modal
    alignItems: 'center',
    marginBottom:15,
    marginTop:5
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // This ensures the image covers the entire screen without distorting
},
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  }
});