declare module 'jimp-compact' {
  type JimpInstance = {
    contain(width: number, height: number): JimpInstance;
    getBufferAsync(mime: string): Promise<Buffer>;
  };

  const Jimp: {
    MIME_PNG: string;
    read(input: Buffer): Promise<JimpInstance>;
  };

  export default Jimp;
}
