import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const router = express.Router();
const execAsync = promisify(exec);

// Help chat endpoint
router.post('/', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Create a specialized prompt for the help assistant
    const helpPrompt = `あなたはClaude Codeのヘルプアシスタントです。以下の点に注意して回答してください：

1. Claude Codeの機能について分かりやすく説明する
2. プログラミング用語を初心者にも理解できるように解説する
3. 具体的な例を使って説明する
4. 日本語で親しみやすく回答する
5. 回答は簡潔にまとめる

Claude Codeの主な機能：
- プロジェクト管理とチャットセッション保存
- ファイルの作成・編集・削除
- Git統合
- ターミナルコマンド実行
- 音声入力
- セッション履歴

ユーザーの質問: ${message}`;

    // Prepare the Claude command with print option for immediate response
    const claudeCommand = `claude --print --model sonnet "${helpPrompt.replace(/"/g, '\\"')}"`;
    
    // Execute Claude CLI in the home directory (no need for temp dir)
    const { stdout, stderr } = await execAsync(claudeCommand, {
      env: { ...process.env },
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for longer responses
    });

    if (stderr && !stderr.includes('Warning')) {
      console.error('Claude CLI stderr:', stderr);
      throw new Error('Claude CLI error: ' + stderr);
    }

    res.json({ response: stdout.trim() });
  } catch (error) {
    console.error('Help chat error:', error);
    
    // Fallback response if Claude CLI fails
    const fallbackResponses = {
      'API': 'APIとは「Application Programming Interface」の略で、異なるソフトウェア間でデータをやり取りするための仕組みです。例えば、天気予報アプリが天気データを取得する際に使う仕組みがAPIです。',
      'WebSocket': 'WebSocketは、ブラウザとサーバー間でリアルタイムの双方向通信を可能にする技術です。チャットアプリやライブ更新などで使われます。',
      'Git': 'Gitは、ファイルの変更履歴を管理するバージョン管理システムです。コードの変更を記録し、必要に応じて過去の状態に戻すことができます。',
      'npm': 'npmは「Node Package Manager」の略で、JavaScriptのパッケージ（ライブラリ）を管理するツールです。必要な機能を簡単にプロジェクトに追加できます。',
      'Claude Code': 'Claude Codeは、AIアシスタントのClaudeをコマンドラインから使えるツールです。コードの作成、編集、デバッグなどを対話的に行えます。'
    };
    
    // Check if the message contains any known keywords
    let fallbackResponse = null;
    for (const [keyword, response] of Object.entries(fallbackResponses)) {
      if (message.toLowerCase().includes(keyword.toLowerCase())) {
        fallbackResponse = response;
        break;
      }
    }
    
    if (fallbackResponse) {
      res.json({ response: fallbackResponse });
    } else {
      res.json({ 
        response: '申し訳ございません。現在ヘルプ機能が一時的に利用できません。\n\nClaude Codeの基本的な使い方：\n- 新しいプロジェクトを作成：左サイドバーの「+」ボタン\n- チャットでコード生成：質問や指示を入力\n- ファイル参照：@記号でファイルを指定\n- 音声入力：マイクボタンで音声入力\n\n詳しくは公式ドキュメントをご覧ください。'
      });
    }
  }
});

export default router;