const writeString = (target: Buffer, offset: number, value: string) => {
  target.write(value, offset, value.length, 'ascii')
}

export const pcm16StereoToWav = (
  pcmData: Buffer,
  sampleRate = 48_000,
  channels = 2,
): Buffer => {
  const bitsPerSample = 16
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const wavBuffer = Buffer.alloc(44 + pcmData.length)

  writeString(wavBuffer, 0, 'RIFF')
  wavBuffer.writeUInt32LE(36 + pcmData.length, 4)
  writeString(wavBuffer, 8, 'WAVE')
  writeString(wavBuffer, 12, 'fmt ')
  wavBuffer.writeUInt32LE(16, 16)
  wavBuffer.writeUInt16LE(1, 20)
  wavBuffer.writeUInt16LE(channels, 22)
  wavBuffer.writeUInt32LE(sampleRate, 24)
  wavBuffer.writeUInt32LE(byteRate, 28)
  wavBuffer.writeUInt16LE(blockAlign, 32)
  wavBuffer.writeUInt16LE(bitsPerSample, 34)
  writeString(wavBuffer, 36, 'data')
  wavBuffer.writeUInt32LE(pcmData.length, 40)
  pcmData.copy(wavBuffer, 44)

  return wavBuffer
}
