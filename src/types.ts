export interface FaceAnalysisResult {
  date: number;
  hydration: number;
  sebum: number;
  ph: number;
  melanin: number;
  phototype: number;
  summary: string;
  images?: string[]; // base64 downscaled images
}

export interface BodyAnalysisResult {
  date: number;
  waterRetention: number;
  cellulite: string;
  tone: number;
  phototype: number;
  summary: string;
  images?: string[]; // base64 downscaled images
}

export interface Client {
  id: string;
  name: string;
  createdAt: number;
  faceAnalysis?: FaceAnalysisResult;
  bodyAnalysis?: BodyAnalysisResult;
}
