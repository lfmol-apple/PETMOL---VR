from src.admin.broadcast_router import admin_open_url


def test_open_url_produto_usa_o_link_exato_sem_medicao():
    u = "https://www.cobasi.com.br/p/x?utm=1&a=b"
    assert admin_open_url("produto", u) == u


def test_open_url_tela_do_app_sem_b():
    assert admin_open_url("food", None) == "/home?modal=food"
    assert admin_open_url("home", None) == "/home"
    assert "b=" not in admin_open_url("loja", None)
