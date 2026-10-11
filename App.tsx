import { StyleSheet, View } from 'react-native';
import React from 'react';
import FilePickerButton from './src/components/filePickerButton';

export default function App() {
  return (
    <View style={styles.container}>
      <FilePickerButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
