package com.facincanitech.sonorhub;

import android.app.PictureInPictureParams;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    // Marcador exigido pelo plugin de login social pra liberar o pedido de
    // escopos extras do Google (Gmail/Calendar/Contacts/YouTube) — sem lógica própria.
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    private boolean pipReceiverRegistered = false;
    private final BroadcastReceiver pipControlReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String control = intent.getStringExtra(PlayerPipPlugin.EXTRA_CONTROL);
            if (control != null) PlayerPipPlugin.emitControlIfActive(control);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BriefingAlarmPlugin.class);
        registerPlugin(SmsPlugin.class);
        registerPlugin(PlayerPipPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        if (!pipReceiverRegistered) {
            IntentFilter filter = new IntentFilter(PlayerPipPlugin.ACTION_PIP_CONTROL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(pipControlReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(pipControlReceiver, filter);
            }
            pipReceiverRegistered = true;
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Reforço pro botão de "apps recentes" (Overview) — em alguns aparelhos
        // ele só passa por aqui (onStop), não por onUserLeaveHint/onPause a
        // tempo de entrar em PiP. isFinishing() exclui o caso de fechar de
        // verdade (botão Voltar na tela raiz) — aí não é pra abrir PiP.
        if (!isFinishing()) tryEnterPip();
        if (pipReceiverRegistered) {
            unregisterReceiver(pipControlReceiver);
            pipReceiverRegistered = false;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        AppState.isForeground = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        AppState.isForeground = false;
        // onUserLeaveHint() não dispara em todo caminho de minimizar (alguns
        // aparelhos/gestos não chamam ele) — tenta de novo aqui como reforço,
        // já que entrar em PiP enquanto já está em PiP é inofensivo (a chamada
        // simplesmente não faz nada/lança, cai no catch).
        tryEnterPip();
    }

    // Disparado quando o usuário sai do app (home, troca de app) — se tem
    // mídia tocando no Player, entra em PiP em vez de só minimizar normal.
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        tryEnterPip();
    }

    // Em vez de tentar recortar coordenadas certas pro PiP (não deu certo de
    // forma confiável em todo aparelho/tela), avisa o JS pra esconder tudo e
    // deixar só a capa/vídeo ocupando a tela inteira ANTES de entrar em PiP —
    // assim o Android só "fotografa" o que já está sozinho ali. O delay
    // pequeno dá tempo do JS aplicar a mudança de CSS antes da captura.
    private void tryEnterPip() {
        if (!PlayerPipPlugin.isPlaybackActive() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        PlayerPipPlugin.emitPipVisualModeIfActive(true);
        new android.os.Handler(getMainLooper()).postDelayed(() -> {
            try {
                enterPictureInPictureMode(PlayerPipPlugin.buildPipParams(this));
            } catch (Exception e) {
                android.util.Log.e("InfoHubPip", "Falha ao entrar em PiP: " + e.getMessage(), e);
            }
        }, 120);
    }

    // PiP foi fechado (usuário arrastou pro X, ou voltou pro app normal)
    // — avisa o JS pra desfazer o "modo visual de PiP" e mostrar a tela
    // normal de novo. Se foi fechado de propósito enquanto a mídia ainda
    // devia tocar, também sobe o Foreground Service com a notificação.
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (!isInPictureInPictureMode) {
            PlayerPipPlugin.emitPipVisualModeIfActive(false);
            if (PlayerPipPlugin.isPlaybackActive()) {
                PlayerForegroundService.start(this);
            }
        }
    }

    // App já estava aberto (singleTask) quando o alarme disparou — avisa o JS
    // direto via evento, em vez de depender do consumePendingAlarm() do load inicial.
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String time = intent.getStringExtra(BriefingAlarmPlugin.EXTRA_AUTOPLAY_TIME);
        if (time != null && getBridge() != null) {
            PluginHandle handle = getBridge().getPlugin("BriefingAlarm");
            if (handle != null) {
                Plugin plugin = handle.getInstance();
                if (plugin instanceof BriefingAlarmPlugin) {
                    ((BriefingAlarmPlugin) plugin).emitAlarmFired(time);
                }
            }
        }
    }
}
