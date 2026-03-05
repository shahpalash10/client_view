import { createContext, useContext, useMemo, useState } from 'react'

const translations = {
  en: {
    app: {
      intro: {
        primary: 'XIBERLINC PRESENTS',
        secondary: 'REALTIME LAB'
      },
      hero: {
        eyebrow: 'Realtime lab by Xiberlinc',
        title: 'Emotion Capture Console',
        description: 'Stream, calibrate, and visualize facial biometrics.',
        tech: 'WebRTC · MediaPipe · PyTorch'
      },
      buttons: {
        startSession: 'Start session',
        stopSession: 'Stop session',
        shareLink: 'Share link',
        copied: '✓ Copied!'
      },
      connection: {
        states: {
          connected: 'Connected',
          connecting: 'Connecting',
          blocked: 'Blocked',
          idle: 'Idle'
        }
      },
      stats: {
        sessionLabel: 'Session',
        recording: 'Recording',
        idle: 'Idle',
        profileLabel: 'Profile',
        profileUnset: 'Not selected',
        profileCalibrated: 'Calibrated',
        profileNeedsCalibration: 'Needs calibration',
        profileTapToAdd: 'Tap to add',
        predictionsLabel: 'Predictions buffered',
        predictionsMeta: 'Rolling window',
        calibrationLabel: 'Calibration',
        calibrationInProgress: 'In progress',
        calibrationStandby: 'Standby',
        samplesSuffix: 'samples',
        calibrationEmotions: {
          neutral: 'Neutral',
          happy: 'Happy',
          sad: 'Sad'
        }
      },
      footer: 'biometrics · sentiment · realtime',
      errors: {
        profileRequired: 'Select a calibrated profile before starting a live session.'
      }
    },
    capture: {
      eyebrow: 'Input',
      title: 'Camera stream',
      sendRate: 'Send rate',
      sendRateHelp: 'Frame processing rate',
      meshOverlay: 'Mesh overlay',
      cameraInactive: 'Camera inactive',
      original: 'Original',
      status: 'Status',
      active: 'Active',
      inactive: 'Inactive',
      features: 'Features',
      description: 'Using MediaPipe FaceMesh to extract 467 facial landmarks (x, y, z). Camera-only biometric capture.'
    },
    profiles: {
      eyebrow: 'Profiles',
      title: 'Calibration identities',
      explanationTitle: 'Calibration loop',
      toggleExplanation: 'Toggle explanation panel',
      explanationSteps: [
        '1 · Profile — Create a named identity per participant.',
        '2 · Capture — Neutral, Happy, and Sad blocks (10s each).',
        '3 · Learn — Baselines are computed on-device.',
        '4 · Apply — All predictions inherit that personalization.'
      ],
      calibrated: 'Calibrated',
      needsCalibration: 'Needs calibration',
      userId: 'User id',
      recalibrate: 'Recalibrate',
      placeholder: 'Enter profile name',
      create: 'Create',
      cancel: 'Cancel',
      newProfile: 'New profile',
      deleteConfirm: 'Delete this profile?'
    },
    importance: {
      title: 'Feature importance',
      processing: 'Processing features...',
      startSession: 'Start a session to populate importance',
      filters: {
        arousal: 'Arousal',
        valence: 'Valence',
        expectation: 'Expectation'
      },
      footer: 'Showing top PCA components influencing {{emotion}}'
    },
    pca: {
      loading: 'Loading PCA components...',
      title: 'PCA inspector',
      components: 'Components',
      regionsPrefix: 'Regions: ',
      topLandmarksPrefix: 'Top landmarks: ',
      view: 'View',
      helper: 'Click a component to highlight contributing landmarks on the camera preview.',
      detail: {
        noData: 'No data',
        majorRegionTemplate: 'Major region: {{region}} — top landmarks around the {{region}}',
        topLandmarksPrefix: 'Top landmarks: '
      }
    },
    predictions: {
      headingEyebrow: 'Arousal × Valence',
      headingTitle: 'Quadrant Mapper',
      quadrantLabel: 'Current quadrant',
      metrics: {
        arousal: 'Arousal',
        valence: 'Valence',
        expectation: 'Expectation'
      },
      confidence: '{{value}}% classifier confidence',
      digestTitle: 'Session digest',
      samplesCaptured: 'Samples captured',
      avgExpectation: 'Avg expectation',
      valencePivot: 'Valence pivot',
      lastUpdate: 'Last update',
      quadrantMap: 'Quadrant map',
      axisLabel: 'Arousal ↑ / Valence →',
      signalTimeline: 'Signal timeline',
      lastSamples: 'Last {{count}} samples',
      dwellTime: 'Quadrant dwell time',
      sessionAverages: 'Session averages',
      predictionsAnalyzed: '{{count}} prediction{{suffix}} analyzed',
      waiting: 'Waiting for the first prediction...',
      startSession: 'Start a session to populate the quadrant map.',
      emptyIconLabel: 'Initializing telemetry'
    },
    quadrants: {
      waku: {
        label: 'Waku-Waku',
        tagline: 'Excited + Engaged',
        description: 'High arousal combines with upbeat valence. Think electric curiosity.'
      },
      doki: {
        label: 'Doki-Doki',
        tagline: 'Alert + Uneasy',
        description: 'Energy is high but valence dips. Often linked to anticipation or nerves.'
      },
      ease: {
        label: 'Feel of Ease',
        tagline: 'Calm + Pleasant',
        description: 'Grounded arousal with positive affect. A relaxed, focused presence.'
      },
      discourage: {
        label: 'Discouraged',
        tagline: 'Low Drive',
        description: 'Arousal and valence are both muted, signaling fatigue or withdrawal.'
      }
    },
    calibration: {
      progress: 'Calibration Progress',
      stepLabel: 'Step {{current}} of {{total}}',
      waiting: 'Waiting for live predictions...',
      initializing: 'Initializing stream',
      getReady: 'Get ready...',
      recording: 'Recording...',
      holdSteady: 'Hold your expression steady',
      samplesCaptured: 'Samples captured: {{count}}',
      stopNow: 'Stop now',
      captured: 'Captured!',
      cancel: 'Cancel Calibration',
      calibratingProfile: 'Calibrating profile: {{name}}',
      steps: {
        neutral: {
          title: 'Neutral Expression',
          instruction: 'Relax your face and look at the camera with a neutral expression'
        },
        happy: {
          title: 'Happy Expression',
          instruction: 'Show a big genuine smile! Think of something that makes you happy'
        },
        sad: {
          title: 'Sad Expression',
          instruction: 'Make a sad face. Think of something sad or disappointing'
        }
      }
    },
    generic: {
      hz: 'Hz',
      seconds: 's',
      ready: 'Ready',
      captured: 'Captured',
      samples: 'Samples'
    }
  },
  ja: {
    app: {
      intro: {
        primary: 'XIBERLINC プレゼンツ',
        secondary: 'リアルタイム・ラボ'
      },
      hero: {
        eyebrow: 'Xiberlinc リアルタイムラボ',
        title: '感情キャプチャコンソール',
        description: '顔のバイオメトリクスをストリームし、キャリブレーションして、可視化します。',
        tech: 'WebRTC・MediaPipe・PyTorch'
      },
      buttons: {
        startSession: 'セッション開始',
        stopSession: 'セッション停止',
        shareLink: 'リンクを共有',
        copied: '✓ コピー済み'
      },
      connection: {
        states: {
          connected: '接続済み',
          connecting: '接続中',
          blocked: 'ブロック',
          idle: '待機中'
        }
      },
      stats: {
        sessionLabel: 'セッション',
        recording: '録画中',
        idle: '待機',
        profileLabel: 'プロファイル',
        profileUnset: '未選択',
        profileCalibrated: 'キャリブレーション済み',
        profileNeedsCalibration: '調整が必要',
        profileTapToAdd: 'タップして追加',
        predictionsLabel: '予測バッファ',
        predictionsMeta: 'ローリングウィンドウ',
        calibrationLabel: 'キャリブレーション',
        calibrationInProgress: '進行中',
        calibrationStandby: 'スタンバイ',
        samplesSuffix: 'サンプル',
        calibrationEmotions: {
          neutral: 'ニュートラル',
          happy: 'ハッピー',
          sad: 'サッド'
        }
      },
      footer: 'バイオメトリクス · 感情 · リアルタイム',
      errors: {
        profileRequired: 'ライブセッションを開始する前に調整済みプロファイルを選択してください。'
      }
    },
    capture: {
      eyebrow: '入力',
      title: 'カメラストリーム',
      sendRate: '送信レート',
      sendRateHelp: 'フレーム処理レート',
      meshOverlay: 'メッシュオーバーレイ',
      cameraInactive: 'カメラ未起動',
      original: 'オリジナル',
      status: 'ステータス',
      active: 'アクティブ',
      inactive: '停止中',
      features: '特徴量',
      description: 'MediaPipe FaceMesh を使用して 467 個の顔ランドマーク (x, y, z) を抽出します。カメラのみでのバイオメトリクス取得。'
    },
    profiles: {
      eyebrow: 'プロファイル',
      title: 'キャリブレーション ID',
      explanationTitle: 'キャリブレーションループ',
      toggleExplanation: '説明パネルを表示/非表示',
      explanationSteps: [
        '1 · プロファイル — 参加者ごとに名前付き ID を作成します。',
        '2 · キャプチャ — ニュートラル／ハッピー／サッドを各 10 秒取得。',
        '3 · ラーン — 端末上でベースラインを算出します。',
        '4 · 適用 — すべての予測にパーソナライズを適用します。'
      ],
      calibrated: 'キャリブレーション済み',
      needsCalibration: '調整が必要',
      userId: 'ユーザー ID',
      recalibrate: '再キャリブレーション',
      placeholder: 'プロファイル名を入力',
      create: '作成',
      cancel: 'キャンセル',
      newProfile: '新規プロファイル',
      deleteConfirm: 'このプロファイルを削除しますか？'
    },
    importance: {
      title: '特徴量の寄与',
      processing: '特徴量を処理中...',
      startSession: 'セッションを開始して寄与を表示',
      filters: {
        arousal: '覚醒度',
        valence: '感情価',
        expectation: '期待値'
      },
      footer: '{{emotion}} に影響する主要 PCA コンポーネント'
    },
    pca: {
      loading: 'PCA コンポーネントを読み込み中...',
      title: 'PCA インスペクター',
      components: 'コンポーネント',
      regionsPrefix: '領域: ',
      topLandmarksPrefix: '主なランドマーク: ',
      view: '表示',
      helper: 'コンポーネントをクリックするとカメラプレビュー上でランドマークを強調表示します。',
      detail: {
        noData: 'データなし',
        majorRegionTemplate: '主要領域: {{region}} — {{region}} 周辺のランドマーク',
        topLandmarksPrefix: '主なランドマーク: '
      }
    },
    predictions: {
      headingEyebrow: '覚醒度 × 感情価',
      headingTitle: 'クアドラントマッパー',
      quadrantLabel: '現在のクアドラント',
      metrics: {
        arousal: '覚醒度',
        valence: '感情価',
        expectation: '期待値'
      },
      confidence: '{{value}}% 分類器信頼度',
      digestTitle: 'セッションダイジェスト',
      samplesCaptured: '取得サンプル数',
      avgExpectation: '平均期待値',
      valencePivot: '感情価ピボット',
      lastUpdate: '最終更新',
      quadrantMap: 'クアドラントマップ',
      axisLabel: '覚醒度 ↑ / 感情価 →',
      signalTimeline: 'シグナルタイムライン',
      lastSamples: '直近 {{count}} サンプル',
      dwellTime: 'クアドラント滞在時間',
      sessionAverages: 'セッション平均',
      predictionsAnalyzed: '{{count}} 件の予測を解析',
      waiting: '最初の予測を待機中...',
      startSession: 'クアドラントマップを表示するにはセッションを開始してください。',
      emptyIconLabel: 'テレメトリ初期化中'
    },
    quadrants: {
      waku: {
        label: 'ワクワク',
        tagline: '高揚 × 期待',
        description: '覚醒度と感情価がともに高く、電気的な好奇心が満ちています。'
      },
      doki: {
        label: 'ドキドキ',
        tagline: '警戒 × 不安',
        description: 'エネルギーは高い一方で感情価が落ち込み、緊張や不安が表れます。'
      },
      ease: {
        label: 'やすらぎ',
        tagline: '穏やか × 心地よい',
        description: '落ち着いた覚醒度とポジティブな感情価。リラックスして集中している状態。'
      },
      discourage: {
        label: 'ディスカレッジ',
        tagline: '低駆動',
        description: '覚醒度と感情価がともに低く、疲労や離脱傾向を示します。'
      }
    },
    calibration: {
      progress: 'キャリブレーション進行度',
      stepLabel: '{{total}} ステップ中 {{current}}',
      waiting: 'ライブ予測を待機中...',
      initializing: 'ストリーム初期化中',
      getReady: '準備してください...',
      recording: '記録中...',
      holdSteady: '表情をキープしてください',
      samplesCaptured: '取得サンプル: {{count}}',
      stopNow: '今すぐ停止',
      captured: '取得完了！',
      cancel: 'キャリブレーションを終了',
      calibratingProfile: '調整中のプロファイル: {{name}}',
      steps: {
        neutral: {
          title: 'ニュートラル表情',
          instruction: '力を抜いてカメラを見つめ、ニュートラルな表情を保ってください'
        },
        happy: {
          title: 'ハッピー表情',
          instruction: '心からの笑顔を！楽しい出来事を思い浮かべてください'
        },
        sad: {
          title: 'サッド表情',
          instruction: '悲しい出来事を思い出し、しょんぼりした表情をしてください'
        }
      }
    },
    generic: {
      hz: 'Hz',
      seconds: '秒',
      ready: '準備完了',
      captured: '取得済み',
      samples: 'サンプル'
    }
  }
}

const LanguageContext = createContext({
  language: 'en',
  toggleLanguage: () => {},
  setLanguage: () => {},
  t: (key) => key
})

const resolveKey = (obj, key) => {
  return key.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) {
      return acc[segment]
    }
    return undefined
  }, obj)
}

const applyParams = (value, params) => {
  if (typeof value !== 'string' || !params) return value
  return value.replace(/\{\{(.*?)\}\}/g, (_, match) => {
    const trimmed = match.trim()
    return trimmed in params ? params[trimmed] : `{{${trimmed}}}`
  })
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en')

  const t = (key, params) => {
    const langTable = translations[language] || translations.en
    const fallbackTable = translations.en
    const value = resolveKey(langTable, key)
    const fallbackValue = resolveKey(fallbackTable, key)
    const resolved = value ?? fallbackValue ?? key
    return typeof resolved === 'string' ? applyParams(resolved, params) : resolved
  }

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(prev => (prev === 'en' ? 'ja' : 'en')),
    t
  }), [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
