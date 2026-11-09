from src.config import Settings, admin_allowed_emails


def test_admin_extra_inclui_master_e_o_segundo_email():
    s = Settings(admin_master_email="Master@x.com", admin_extra_emails=" contato@vepiconsorcios.com.br , ")
    assert admin_allowed_emails(s) == {"master@x.com", "contato@vepiconsorcios.com.br"}


def test_admin_extra_vazio_deixa_so_o_master():
    s = Settings(admin_master_email="master@x.com", admin_extra_emails="")
    assert admin_allowed_emails(s) == {"master@x.com"}
