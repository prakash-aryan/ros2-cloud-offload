export interface ScanFrame {
  stamp: number;
  angle_min: number;
  angle_max: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  ranges: (number | null)[];
}

export interface OdomFrame {
  stamp: number;
  x: number;
  y: number;
  yaw: number;
}

export interface CloudStats {
  hostname: string;
  beams: number;
  scan_ts: number;
  recv_ts: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  seen_backend_ts: number;
}

export interface CloudDepth {
  hostname: string;
  width: number;
  height: number;
  encoding: string;
  scan_ts: number;
  recv_ts: number;
  bytes_per_sec: number;
  total_pixels: number;
  valid_pixels: number;
  closest_m: number | null;
  mean_m: number | null;
  close_pixels: number;
  near_threshold_m: number;
  seen_backend_ts: number;
}

export interface TopicsSnapshot {
  scan?: ScanFrame;
  odom?: OdomFrame;
  cloud_stats?: CloudStats;
  cloud_depth?: CloudDepth;
}

export interface ServerFrame {
  ts: number;
  topics: TopicsSnapshot;
}

export interface AppConfig {
  local: { hostname: string; ip: string };
  cloud: { hostname: string; ip: string; ssh_user: string };
  dds: { interface: string; domain_id: string };
}
