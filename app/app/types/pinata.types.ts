export interface PinataFileMetadata {
  id: string;
  cid: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  keyvalues?: Record<string, string>;
}
