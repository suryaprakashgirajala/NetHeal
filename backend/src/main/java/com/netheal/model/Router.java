package com.netheal.model;

public class Router {

    private final String id;
    private boolean active;

    public Router(String id) {
        this.id = id;
        this.active = true;
    }

    public String getId() {
        return id;
    }

    public boolean isActive() {
        return active;
    }

    public void fail() {
        active = false;
    }

    public void recover() {
        active = true;
    }

    @Override
    public String toString() {
        return "Router{id='" + id + "', status=" +
                (active ? "ACTIVE" : "FAILED") + "}";
    }
}
