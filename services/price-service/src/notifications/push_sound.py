"""Som do aviso de Pet Sumido: pronto, mas DESLIGADO por padrão (ver settings.push_sound_style).

Só o aviso "pet sumido perto de você" muda de som; qualquer outra notificação segue com o som do
sistema. Se o arquivo de som não existir no app instalado, o iOS toca o som padrão e o Android usa
o canal padrão — por isso é seguro ligar antes de todo mundo atualizar o app.
"""
from typing import Optional

from ..config import get_settings

STYLES = {"default", "petmol", "latido"}
_IOS_FILES = {"petmol": "petmol.caf", "latido": "latido.caf"}
_ANDROID_CHANNELS = {"petmol": "petmol_som_petmol", "latido": "petmol_som_latido"}


def push_sound_style(payload: dict) -> str:
    """'default' | 'petmol' | 'latido'. Valor inválido ou vazio no env vira 'default'."""
    style = str(get_settings().push_sound_style or "default").strip().lower()
    return style if style in STYLES else "default"


def apns_sound(payload: dict) -> str:
    return _IOS_FILES.get(push_sound_style(payload), "default")


def fcm_channel_id(payload: dict) -> Optional[str]:
    return _ANDROID_CHANNELS.get(push_sound_style(payload))
