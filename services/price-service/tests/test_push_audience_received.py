"""Filtro "Notificações de campanha já recebidas" (nunca recebeu / já recebeu) e a união E/OU de públicos."""
import uuid

import src.admin.push_audience as pa
import src.admin.push_campaigns as pc
from src.admin.broadcast_router import AdminBroadcastRecipient
from tests.test_push_audience import NOW, World, db, R, G  # noqa: F401  (db é fixture)


def _flt(root):
    return pc.AudienceFilter(version=1, root=root)


def _delivered(db, uid, ok=True):
    db.add(AdminBroadcastRecipient(broadcast_id=str(uuid.uuid4()), user_id=uid, delivered=ok))
    db.flush()


def _ids(db, root):
    return set(pa.resolve_audience_ids(db, _flt(root), now=NOW))


def test_nunca_recebeu_e_ja_recebeu(db):
    w = World(db)
    novo, velho, falhou = w.user("Novo", ios=True), w.user("Velho", ios=True), w.user("Falhou", ios=True)
    _delivered(db, velho)
    _delivered(db, falhou, ok=False)          # push não aceito por nenhum aparelho = não recebeu
    db.commit()
    assert _ids(db, G(R("push_received", "eq", "never"))) == {novo, falhou}
    assert _ids(db, G(R("push_received", "eq", "received"))) == {velho}


def test_combina_com_racao_em_E_e_em_OU_e_soma_pessoas_extras(db):
    w = World(db)
    a = w.user("A", ios=True)      # nunca recebeu, sem ração
    b = w.user("B", ios=True)      # já recebeu, com ração
    c = w.user("C", ios=True)      # nunca recebeu, com ração
    w.plan(w.pet(b), brand="X")
    w.plan(w.pet(c), brand="X")
    _delivered(db, b)
    db.commit()
    reg, nunca = R("feeding_registered", "eq", True), R("push_received", "eq", "never")
    assert _ids(db, G(G(reg, nunca, op="and", scope="same"), op="and")) == {c}                    # E: tem ração E nunca recebeu
    assert _ids(db, G(G(reg, scope="any"), G(nunca), op="or")) == {a, b, c}  # OU: tem ração OU nunca recebeu
    # "além do grupo": o grupo filtrado + pessoas escolhidas à mão (união no topo)
    extras = G(R("tutor_selected", "in", [a]))
    assert _ids(db, G(G(reg, nunca, op="and", scope="same"), extras, op="or")) == {c, a}
