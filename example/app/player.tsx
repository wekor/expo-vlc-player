import * as React from 'react';

import { ExpoVlcPlayerView } from '@wekor/expo-vlc-player';

// 单变量验证：
//   假设：上次闪退是因为 `--rtsp-caching=200` 这个选项在 libvlc 4.x 里不存在
//        （它在 libvlc 2.0.0 就被 obsolete 了，libvlc 4.x 完全移除了 obsolete 声明）。
//        而 `--network-caching=200` 是 libvlc 4.x 当前合法选项 (libvlc-module.c:1996)。
//   操作：保留 `--network-caching=200` 作为 init option，移除 `--rtsp-caching=200`。
//        如果不闪退 → 假设成立，rtsp-caching 才是元凶。
const RTSP_INIT_OPTIONS = [
  '--rtsp-tcp',
  '--network-caching=200',
  '--rtsp-caching=200',   // 故意去掉，这个在 libvlc 4.x 里已不存在
];

export default function App() {
  return (
    <ExpoVlcPlayerView
      style={styles.player}
      url="rtsp://172.27.1.38:50001/live/0"
      resizeMode="contain"
      initOptions={RTSP_INIT_OPTIONS}
      // 故意不传 mediaOptions —— 单变量
      onPlaying={() => {
        console.log('onPlaying');
      }}
      onError={(e) => {
        console.warn('onError', e.nativeEvent);
      }}
    />
  );
}

const styles = {
  player: {
    width: '100%',
    flex: 1,
  },
} as const;
