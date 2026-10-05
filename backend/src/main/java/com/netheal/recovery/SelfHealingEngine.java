package com.netheal.recovery;

import com.netheal.graph.NetworkGraph;
import com.netheal.metrics.NetworkMetrics;
import com.netheal.routing.DijkstraRouter;

import java.util.List;

public class SelfHealingEngine {

    private final NetworkGraph network;
    private final FailureDetector failureDetector;
    private final NetworkMetrics metrics;

    public SelfHealingEngine(
            NetworkGraph network,
            FailureDetector failureDetector,
            NetworkMetrics metrics) {

        this.network = network;
        this.failureDetector = failureDetector;
        this.metrics = metrics;
    }

    public List<String> recoverRoute(
            String source,
            String destination,
            List<String> failedRoute) {

        long recoveryStartTime = System.nanoTime();

        System.out.println("\n===== SELF-HEALING ENGINE =====");

        // Check for failures
        failureDetector.displayFailures();

        System.out.println("\nStarting route recovery...");

        System.out.println(
                "Previous Route: "
                        + String.join(" -> ", failedRoute)
        );

        // Calculate new route
        List<String> newRoute =
                DijkstraRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        long recoveryEndTime = System.nanoTime();

        long recoveryTimeMs =
                (recoveryEndTime - recoveryStartTime)
                        / 1_000_000;

        metrics.setRecoveryTimeMs(recoveryTimeMs);

        if (newRoute.isEmpty()) {

            System.out.println(
                    "Recovery Failed"
            );

            System.out.println(
                    "Reason: No alternate route available"
            );

        } else {

            System.out.println(
                    "Alternate Route Found: "
                            + String.join(
                                    " -> ",
                                    newRoute
                            )
            );

            System.out.println(
                    "Recovery Completed"
            );

            System.out.println(
                    "Recovery Time: "
                            + recoveryTimeMs
                            + " ms"
            );

            System.out.println(
                    "Communication can continue."
            );
        }

        return newRoute;
    }
}