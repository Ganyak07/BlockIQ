;; BlockIQ Core Market Contract - Phase 1
;; Initial commit: Basic prediction market functionality

;; =====================================
;; CONSTANTS AND ERROR CODES
;; =====================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-MARKET-NOT-FOUND (err u101))
(define-constant ERR-MARKET-CLOSED (err u102))
(define-constant ERR-INSUFFICIENT-FUNDS (err u103))
(define-constant ERR-MARKET-RESOLVED (err u104))
(define-constant ERR-INVALID-OUTCOME (err u105))
(define-constant ERR-MARKET-NOT-RESOLVED (err u106))

;; =====================================
;; DATA VARIABLES
;; =====================================

(define-data-var market-counter uint u0)
(define-data-var oracle-address principal CONTRACT-OWNER)

;; =====================================
;; DATA MAPS
;; =====================================

;; Market information storage
(define-map markets 
    uint 
    {
        id: uint,
        title: (string-utf8 256),
        description: (string-utf8 1024),
        creator: principal,
        creation-time: uint,
        resolution-time: uint,
        total-stake-yes: uint,
        total-stake-no: uint,
        resolved: bool,
        outcome: (optional bool),
        oracle: principal
    }
)

;; User stakes on specific markets
(define-map user-stakes 
    {market-id: uint, user: principal} 
    {
        stake-yes: uint,
        stake-no: uint,
        claimed: bool
    }
)

;; Market status tracking
(define-map market-status 
    uint 
    {
        is-active: bool,
        participants: uint,
        resolution-submitted: bool
    }
)

;; =====================================
;; READ-ONLY FUNCTIONS
;; =====================================

;; Get market information
(define-read-only (get-market (market-id uint))
    (map-get? markets market-id)
)

;; Get user stake in a market
(define-read-only (get-user-stake (market-id uint) (user principal))
    (map-get? user-stakes {market-id: market-id, user: user})
)

;; Get current market counter
(define-read-only (get-market-counter)
    (var-get market-counter)
)

;; Calculate potential payout for a stake
(define-read-only (calculate-payout (market-id uint) (outcome bool) (stake-amount uint))
    (match (get-market market-id)
        market-data 
        (let (
            (total-yes (get total-stake-yes market-data))
            (total-no (get total-stake-no market-data))
            (total-pool (+ total-yes total-no))
        )
        (if (is-eq outcome true)
            ;; If betting YES: payout = (stake * total-pool) / total-yes-stakes
            (if (> total-yes u0)
                (some (/ (* stake-amount total-pool) total-yes))
                none)
            ;; If betting NO: payout = (stake * total-pool) / total-no-stakes  
            (if (> total-no u0)
                (some (/ (* stake-amount total-pool) total-no))
                none)))
        none)
)

;; Check if market is active
(define-read-only (is-market-active (market-id uint))
    (match (map-get? market-status market-id)
        status (get is-active status)
        false)
)

;; =====================================
;; PUBLIC FUNCTIONS
;; =====================================

;; Create a new prediction market
(define-public (create-market 
    (title (string-utf8 256)) 
    (description (string-utf8 1024))
    (resolution-time uint))
    
    (let (
        (new-market-id (+ (var-get market-counter) u1))
        (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    
    ;; Validate resolution time is in future
    (asserts! (> resolution-time current-time) ERR-INVALID-OUTCOME)
    
    ;; Create market record
    (map-set markets new-market-id {
        id: new-market-id,
        title: title,
        description: description,
        creator: tx-sender,
        creation-time: current-time,
        resolution-time: resolution-time,
        total-stake-yes: u0,
        total-stake-no: u0,
        resolved: false,
        outcome: none,
        oracle: (var-get oracle-address)
    })
    
    ;; Set market as active
    (map-set market-status new-market-id {
        is-active: true,
        participants: u0,
        resolution-submitted: false
    })
    
    ;; Update counter
    (var-set market-counter new-market-id)
    
    ;; Return market ID
    (ok new-market-id))
)

;; Stake on market outcome
(define-public (stake-on-outcome (market-id uint) (outcome bool) (amount uint))
    (let (
        (market-data (unwrap! (get-market market-id) ERR-MARKET-NOT-FOUND))
        (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
        (existing-stake (default-to {stake-yes: u0, stake-no: u0, claimed: false} 
                                   (get-user-stake market-id tx-sender)))
    )
    
    ;; Validate market is active and not past resolution time
    (asserts! (is-market-active market-id) ERR-MARKET-CLOSED)
    (asserts! (< current-time (get resolution-time market-data)) ERR-MARKET-CLOSED)
    (asserts! (not (get resolved market-data)) ERR-MARKET-RESOLVED)
    (asserts! (> amount u0) ERR-INSUFFICIENT-FUNDS)
    
    ;; Transfer STX to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    
    ;; Update market totals and user stakes
    (if outcome
        ;; Betting YES
        (begin
            (map-set markets market-id 
                (merge market-data {total-stake-yes: (+ (get total-stake-yes market-data) amount)}))
            (map-set user-stakes {market-id: market-id, user: tx-sender}
                (merge existing-stake {stake-yes: (+ (get stake-yes existing-stake) amount)})))
        ;; Betting NO  
        (begin
            (map-set markets market-id 
                (merge market-data {total-stake-no: (+ (get total-stake-no market-data) amount)}))
            (map-set user-stakes {market-id: market-id, user: tx-sender}
                (merge existing-stake {stake-no: (+ (get stake-no existing-stake) amount)}))))
    
    ;; Update participant count if first stake
    (if (and (is-eq (get stake-yes existing-stake) u0) (is-eq (get stake-no existing-stake) u0))
        (map-set market-status market-id 
            (merge (unwrap-panic (map-get? market-status market-id)) 
                   {participants: (+ (get participants (unwrap-panic (map-get? market-status market-id))) u1)}))
        true)
    
    (ok true))
)

